use futures_util::StreamExt;
use matrix_sdk::ruma::{
    api::client::room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
    room::RoomType,
    serde::Raw,
};
use matrix_sdk_ui::spaces::SpaceService;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, rc::Rc};
use tsify_next::Tsify;

use crate::{client, diff::serialize_diffs, errors::HarmonyError, subscription::Subscription};

thread_local! {
    static SPACE_SERVICE: RefCell<Option<Rc<SpaceService>>> = const { RefCell::new(None) };
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SpaceData {
    pub room_id: String,
    pub display_name: String,
}

fn convert_space(space: &matrix_sdk_ui::spaces::SpaceRoom) -> SpaceData {
    SpaceData {
        room_id: space.room_id.to_string(),
        display_name: space.display_name.clone(),
    }
}

pub async fn subscribe_spaces_impl() -> Result<Subscription<SpaceData>, HarmonyError> {
    let service = SPACE_SERVICE.with(|inner| inner.borrow().clone());

    let service = if let Some(srvc) = service {
        srvc
    } else {
        let client = client::get().ok_or(HarmonyError::AuthFailed)?;
        let srvc = Rc::new(SpaceService::new(client).await);
        SPACE_SERVICE.with(|inner| *inner.borrow_mut() = Some(srvc.clone()));
        srvc
    };

    let (initial_values, incoming) = service.subscribe_to_top_level_joined_spaces().await;
    let initial = initial_values.iter().map(convert_space).collect();
    let updates = incoming.map(|diffs| serialize_diffs(diffs, convert_space));
    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();

    Ok(Subscription { initial, stream })
}

pub async fn get_spaces_impl() -> Result<Vec<SpaceData>, HarmonyError> {
    let service = SPACE_SERVICE.with(|inner| inner.borrow().clone());

    let Some(service) = service else {
        return Ok(vec![]);
    };

    let spaces = service
        .top_level_joined_spaces()
        .await
        .into_iter()
        .map(|space| convert_space(&space))
        .collect();

    Ok(spaces)
}

pub async fn create_space_impl(name: &str) -> Result<SpaceData, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;

    let mut creation_content = CreationContent::new();
    creation_content.room_type = Some(RoomType::Space);

    let mut request = CreateRoomRequest::new();
    request.name = Some(name.to_owned());
    request.creation_content =
        Some(Raw::new(&creation_content).map_err(|_| HarmonyError::SerializationFailed)?);

    let room = client.create_room(request).await?;

    Ok(SpaceData {
        room_id: room.room_id().to_string(),
        display_name: name.to_owned(),
    })
}
