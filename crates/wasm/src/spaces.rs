use futures_util::StreamExt;
use matrix_sdk::ruma::{
    RoomId,
    api::client::room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
    events::space::child::SpaceChildEventContent,
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

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SpaceData {
    pub room_id: String,
    pub display_name: String,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SpaceFilterData {
    pub space_id: String,
    pub level: u8,
    pub descendants: Vec<String>,
}

fn convert_space_filter(filter: &matrix_sdk_ui::spaces::SpaceFilter) -> SpaceFilterData {
    SpaceFilterData {
        space_id: filter.space_room.room_id.to_string(),
        level: filter.level,
        descendants: filter.descendants.iter().map(ToString::to_string).collect(),
    }
}

fn convert_space(space: &matrix_sdk_ui::spaces::SpaceRoom) -> SpaceData {
    SpaceData {
        room_id: space.room_id.to_string(),
        display_name: space.display_name.clone(),
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

pub async fn subscribe_space_filters_impl() -> Result<Subscription<SpaceFilterData>, HarmonyError> {
    let service = get_service().await?;

    let (initial_values, incoming) = service.subscribe_to_space_filters().await;
    let initial = initial_values.iter().map(convert_space_filter).collect();
    let updates = incoming.map(|diffs| serialize_diffs(diffs, convert_space_filter));
    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();

    Ok(Subscription { initial, stream })
}

async fn create_channel(
    space: &matrix_sdk::Room,
    name: &str,
) -> Result<matrix_sdk::Room, HarmonyError> {
    let server_name = space
        .client()
        .user_id()
        .ok_or(HarmonyError::ClientNotReady)?
        .server_name()
        .to_owned();

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    let channel = space.client().create_room(request).await?;

    let mut child_content = SpaceChildEventContent::new(vec![server_name]);
    child_content.suggested = true;
    space
        .send_state_event_for_key(channel.room_id(), child_content)
        .await?;

    Ok(channel)
}

pub async fn create_room_impl(space_id: &str, name: &str) -> Result<RoomData, HarmonyError> {
    let room_id: &RoomId =
        <&RoomId>::try_from(space_id).map_err(|_| HarmonyError::InvalidUserId)?;
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let space = client
        .get_room(room_id)
        .ok_or(HarmonyError::ClientNotReady)?;

    let channel = create_channel(&space, name).await?;

    Ok(RoomData {
        room_id: channel.room_id().to_string(),
        display_name: name.to_owned(),
        room_type: None,
    })
}

pub async fn create_space_impl(name: &str) -> Result<SpaceData, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;

    let mut creation_content = CreationContent::new();
    creation_content.room_type = Some(RoomType::Space);

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    request.creation_content =
        Some(Raw::new(&creation_content).map_err(|_| HarmonyError::SerializationFailed)?);

    let space = client.create_room(request).await?;
    create_channel(&space, "general").await?;

    Ok(SpaceData {
        room_id: space.room_id().to_string(),
        display_name: name.to_owned(),
    })
}
