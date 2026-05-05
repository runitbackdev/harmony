use futures_util::StreamExt;
use matrix_sdk::ruma::{
    OwnedRoomId, RoomId,
    api::client::{
        room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
        space::get_hierarchy::v1::Request as SpaceHierarchyRequest,
    },
    events::{
        EmptyStateKey, InitialStateEvent,
        room::{
            avatar::RoomAvatarEventContent,
            join_rules::{AllowRule, JoinRule, RoomJoinRulesEventContent},
        },
        space::child::SpaceChildEventContent,
    },
    room::RoomType,
    serde::Raw,
};
use matrix_sdk_ui::spaces::SpaceService;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, rc::Rc};
use tsify_next::Tsify;

use crate::{
    client, diff::serialize_diffs, errors::HarmonyError, rooms::RoomData,
    subscription::Subscription,
};

thread_local! {
    static SPACE_SERVICE: RefCell<Option<Rc<SpaceService>>> = const { RefCell::new(None) };
}

pub async fn get_service() -> Result<Rc<SpaceService>, HarmonyError> {
    let existing = SPACE_SERVICE.with(|inner| inner.borrow().clone());

    if let Some(service) = existing {
        return Ok(service);
    }

    let client = client::get().ok_or(HarmonyError::AuthFailed)?;
    let service = Rc::new(SpaceService::new(client).await);
    SPACE_SERVICE.with(|inner| *inner.borrow_mut() = Some(service.clone()));
    Ok(service)
}

#[derive(Clone, Copy, Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "lowercase")]
pub enum ChannelVisibility {
    Public,
    Private,
}

#[derive(Clone, Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SpaceData {
    pub room_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

fn convert_space(space: &matrix_sdk_ui::spaces::SpaceRoom) -> SpaceData {
    SpaceData {
        room_id: space.room_id.to_string(),
        display_name: space.display_name.clone(),
        avatar_url: space.avatar_url.as_ref().map(ToString::to_string),
    }
}

pub async fn subscribe_spaces_impl() -> Result<Subscription<SpaceData>, HarmonyError> {
    let service = get_service().await?;

    let (initial_values, incoming) = service.subscribe_to_top_level_joined_spaces().await;
    let initial = initial_values.iter().map(convert_space).collect();
    let updates = incoming.map(|diffs| serialize_diffs(diffs, convert_space));
    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();

    Ok(Subscription { initial, stream })
}

pub async fn get_spaces_impl() -> Result<Vec<SpaceData>, HarmonyError> {
    let service = get_service().await?;

    let spaces = service
        .top_level_joined_spaces()
        .await
        .into_iter()
        .map(|space| convert_space(&space))
        .collect();

    Ok(spaces)
}

pub async fn get_space_descendants_impl(space_id: String) -> Result<Vec<String>, HarmonyError> {
    let parsed: matrix_sdk::ruma::OwnedRoomId = space_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidRoomId)?;
    let service = get_service().await?;

    let descendants = service
        .space_filters()
        .await
        .into_iter()
        .find(|f| f.space_room.room_id == parsed)
        .map(|f| f.descendants.iter().map(ToString::to_string).collect())
        .unwrap_or_default();

    Ok(descendants)
}

fn join_rules_for_space(
    space: &matrix_sdk::Room,
    visibility: ChannelVisibility,
) -> RoomJoinRulesEventContent {
    match visibility {
        ChannelVisibility::Public => {
            let allow = vec![AllowRule::room_membership(space.room_id().to_owned())];
            RoomJoinRulesEventContent::restricted(allow)
        }
        ChannelVisibility::Private => RoomJoinRulesEventContent::new(JoinRule::Invite),
    }
}

async fn create_channel(
    space: &matrix_sdk::Room,
    name: &str,
    visibility: ChannelVisibility,
) -> Result<matrix_sdk::Room, HarmonyError> {
    let server_name = space
        .client()
        .user_id()
        .ok_or(HarmonyError::ClientNotReady)?
        .server_name()
        .to_owned();

    let join_rules = join_rules_for_space(space, visibility);
    let join_rules_event = InitialStateEvent::new(EmptyStateKey, join_rules);

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    request.initial_state = vec![
        Raw::new(&join_rules_event)
            .map_err(|_| HarmonyError::SerializationFailed)?
            .cast(),
    ];
    let channel = space.client().create_room(request).await?;

    let mut child_content = SpaceChildEventContent::new(vec![server_name]);
    child_content.suggested = true;
    space
        .send_state_event_for_key(channel.room_id(), child_content)
        .await?;

    Ok(channel)
}

pub async fn create_room_impl(
    space_id: &str,
    name: &str,
    visibility: ChannelVisibility,
) -> Result<RoomData, HarmonyError> {
    let room_id: &RoomId =
        <&RoomId>::try_from(space_id).map_err(|_| HarmonyError::InvalidUserId)?;
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let space = client
        .get_room(room_id)
        .ok_or(HarmonyError::ClientNotReady)?;

    let channel = create_channel(&space, name, visibility).await?;

    Ok(RoomData {
        room_id: channel.room_id().to_string(),
        display_name: name.to_owned(),
        room_type: None,
        unread_count: 0,
        mention_count: 0,
    })
}

pub async fn join_space_impl(space_id: &str) -> Result<SpaceData, HarmonyError> {
    let room_id = <&RoomId>::try_from(space_id).map_err(|_| HarmonyError::InvalidUserId)?;
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;

    let space = client.join_room_by_id(room_id).await?;
    let display_name = space
        .display_name()
        .await
        .map_or(String::new(), |n| n.to_string());

    let hierarchy = client
        .send(SpaceHierarchyRequest::new(room_id.to_owned()))
        .await?;

    let suggested_rooms: Vec<OwnedRoomId> = hierarchy
        .rooms
        .iter()
        .find(|r| r.summary.room_id == room_id)
        .into_iter()
        .flat_map(|space_entry| &space_entry.children_state)
        .filter_map(|raw| raw.deserialize().ok())
        .filter(|child| child.content.suggested)
        .map(|child| child.state_key)
        .collect();

    for child_room_id in &suggested_rooms {
        let _ = client.join_room_by_id(child_room_id).await;
    }

    let avatar_url = space.avatar_url().map(|url| url.to_string());

    Ok(SpaceData {
        room_id: space.room_id().to_string(),
        display_name,
        avatar_url,
    })
}

pub async fn create_space_impl(
    name: &str,
    avatar_bytes: Option<Vec<u8>>,
    avatar_content_type: Option<String>,
) -> Result<SpaceData, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;

    let avatar_mxc = if let (Some(bytes), Some(content_type)) = (avatar_bytes, avatar_content_type)
    {
        let mime: mime::Mime = content_type
            .parse()
            .map_err(|_| HarmonyError::InvalidContentType)?;
        let upload = client.media().upload(&mime, bytes, None).await?;
        Some(upload.content_uri)
    } else {
        None
    };

    let mut creation_content = CreationContent::new();
    creation_content.room_type = Some(RoomType::Space);

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    request.creation_content =
        Some(Raw::new(&creation_content).map_err(|_| HarmonyError::SerializationFailed)?);

    if let Some(ref mxc) = avatar_mxc {
        let mut avatar_event = RoomAvatarEventContent::new();
        avatar_event.url = Some(mxc.clone());
        let avatar_initial = InitialStateEvent::new(EmptyStateKey, avatar_event);
        request.initial_state.push(
            Raw::new(&avatar_initial)
                .map_err(|_| HarmonyError::SerializationFailed)?
                .cast(),
        );
    }

    let space = client.create_room(request).await?;
    create_channel(&space, "general", ChannelVisibility::Public).await?;

    Ok(SpaceData {
        room_id: space.room_id().to_string(),
        display_name: name.to_owned(),
        avatar_url: avatar_mxc.as_ref().map(ToString::to_string),
    })
}
