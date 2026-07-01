use std::sync::Arc;

use futures_util::{Stream, StreamExt, stream};
use matrix_sdk::ruma::{
    RoomId,
    api::client::room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
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
use matrix_sdk_common::SendOutsideWasm;
use matrix_sdk_ui::spaces::SpaceService;

use crate::{
    Rpc, Shared, Subscription, client,
    diff::{ListDiff, convert_diffs},
    harmony, harmony_export,
    internal_error::InternalError,
    rooms::RoomData,
};

static SPACE_SERVICE: Shared<Option<Arc<SpaceService>>> = Shared::new();

pub async fn get_service() -> Result<Arc<SpaceService>, InternalError> {
    if let Some(service) = SPACE_SERVICE.with(|opt| opt.clone()) {
        return Ok(service);
    }

    let client = client::get().ok_or(InternalError::AuthFailed)?;
    let service = Arc::new(SpaceService::new(client).await);
    SPACE_SERVICE.with(|opt| *opt = Some(service.clone()));
    Ok(service)
}

#[harmony]
#[derive(Clone, Copy)]
pub enum ChannelVisibility {
    Public,
    Private,
}

#[harmony]
#[derive(Clone)]
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

#[harmony_export(domain = "spaces")]
pub async fn subscribe() -> Subscription<Vec<SpaceData>, ListDiff<SpaceData>> {
    subscribe_impl().await.into()
}

async fn subscribe_impl() -> Result<
    (
        Vec<SpaceData>,
        impl Stream<Item = ListDiff<SpaceData>> + SendOutsideWasm,
    ),
    InternalError,
> {
    let service = get_service().await?;

    let (initial_values, incoming) = service.subscribe_to_top_level_joined_spaces().await;
    let initial: Vec<SpaceData> = initial_values.iter().map(convert_space).collect();

    let updates = incoming.flat_map(|diffs| stream::iter(convert_diffs(diffs, convert_space)));

    Ok((initial, updates))
}

#[harmony_export(domain = "spaces", action = "get", snapshot_for = "spaces.subscribe")]
pub async fn get() -> Rpc<Vec<SpaceData>> {
    get_impl().await.into()
}

async fn get_impl() -> Result<Vec<SpaceData>, InternalError> {
    let service = get_service().await?;

    let spaces = service
        .top_level_joined_spaces()
        .await
        .into_iter()
        .map(|space| convert_space(&space))
        .collect();

    Ok(spaces)
}

#[harmony_export(domain = "spaces", action = "descendants")]
pub async fn get_descendants(space_id: String) -> Rpc<Vec<String>> {
    get_descendants_impl(space_id).await.into()
}

async fn get_descendants_impl(space_id: String) -> Result<Vec<String>, InternalError> {
    let parsed: matrix_sdk::ruma::OwnedRoomId = space_id
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;
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
) -> Result<matrix_sdk::Room, InternalError> {
    let server_name = space
        .client()
        .user_id()
        .ok_or(InternalError::ClientNotReady)?
        .server_name()
        .to_owned();

    let join_rules = join_rules_for_space(space, visibility);
    let join_rules_event = InitialStateEvent::new(EmptyStateKey, join_rules);

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    request.initial_state = vec![
        Raw::new(&join_rules_event)
            .map_err(|_| InternalError::SerializationFailed)?
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

#[harmony]
pub struct CreateRoomInput {
    pub space_id: String,
    pub name: String,
    pub visibility: ChannelVisibility,
}

#[harmony_export(domain = "spaces", action = "create_room")]
pub async fn create_room(input: CreateRoomInput) -> Rpc<RoomData> {
    create_room_impl(&input.space_id, &input.name, input.visibility)
        .await
        .into()
}

async fn create_room_impl(
    space_id: &str,
    name: &str,
    visibility: ChannelVisibility,
) -> Result<RoomData, InternalError> {
    let room_id: &RoomId =
        <&RoomId>::try_from(space_id).map_err(|_| InternalError::InvalidUserId)?;
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let space = client
        .get_room(room_id)
        .ok_or(InternalError::ClientNotReady)?;

    let channel = create_channel(&space, name, visibility).await?;

    Ok(RoomData {
        room_id: channel.room_id().to_string(),
        display_name: name.to_owned(),
        room_type: None,
        unread_count: 0,
        mention_count: 0,
    })
}

#[harmony]
pub struct CreateSpaceInput {
    pub name: String,
    pub avatar_bytes: Option<Vec<u8>>,
    pub avatar_content_type: Option<String>,
}

#[harmony_export(domain = "spaces", action = "create")]
pub async fn create_space(input: CreateSpaceInput) -> Rpc<SpaceData> {
    create_space_impl(&input.name, input.avatar_bytes, input.avatar_content_type)
        .await
        .into()
}

async fn create_space_impl(
    name: &str,
    avatar_bytes: Option<Vec<u8>>,
    avatar_content_type: Option<String>,
) -> Result<SpaceData, InternalError> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;

    let avatar_mxc = if let (Some(bytes), Some(content_type)) = (avatar_bytes, avatar_content_type)
    {
        let mime: mime::Mime = content_type
            .parse()
            .map_err(|_| InternalError::InvalidContentType)?;
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
        Some(Raw::new(&creation_content).map_err(|_| InternalError::SerializationFailed)?);

    if let Some(ref mxc) = avatar_mxc {
        let mut avatar_event = RoomAvatarEventContent::new();
        avatar_event.url = Some(mxc.clone());
        let avatar_initial = InitialStateEvent::new(EmptyStateKey, avatar_event);
        request.initial_state.push(
            Raw::new(&avatar_initial)
                .map_err(|_| InternalError::SerializationFailed)?
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
