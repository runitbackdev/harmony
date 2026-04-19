#![allow(clippy::future_not_send)]

use wasm_bindgen::prelude::*;

use crate::{
    auth::{LoginRequest, RestoreRequest, SessionData, login_impl, logout_impl, restore_impl},
    errors::HarmonyError,
    rooms::{
        MemberData, RoomData, get_room_members_impl, set_room_filter_impl, subscribe_room_list_impl,
    },
    spaces::{
        ChannelVisibility, SpaceData, create_room_impl, create_space_impl, get_spaces_impl,
        join_space_impl, subscribe_space_filters_impl, subscribe_spaces_impl,
    },
    sync::{start_sync_impl, stop_sync_impl},
    timeline::{
        TimelineEventData, edit_message_impl, get_timeline_impl, mark_as_read_impl,
        paginate_backwards_impl, redact_message_impl, send_message_impl, subscribe_timeline_impl,
        toggle_reaction_impl,
    },
};

mod auth;
mod client;
mod diff;
mod errors;
mod rooms;
mod spaces;
mod subscription;
mod sync;
mod timeline;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = configureTracing)]
pub fn configure_tracing(level: &str) {
    let max_level = match level {
        "trace" => tracing::Level::TRACE,
        "debug" => tracing::Level::DEBUG,
        "info" => tracing::Level::INFO,
        "error" => tracing::Level::ERROR,
        _ => tracing::Level::WARN,
    };

    let config = tracing_wasm::WASMLayerConfigBuilder::new()
        .set_max_level(max_level)
        .build();
    tracing_wasm::set_as_global_default_with_config(config);
}

#[wasm_bindgen]
pub async fn login(request: LoginRequest) -> Result<SessionData, HarmonyError> {
    login_impl(&request).await
}

#[wasm_bindgen(js_name = restoreSession)]
pub async fn restore_session(request: RestoreRequest) -> Result<SessionData, HarmonyError> {
    restore_impl(&request).await
}

#[wasm_bindgen]
pub async fn logout() -> Result<(), HarmonyError> {
    logout_impl().await
}

#[wasm_bindgen(js_name = startSync)]
pub async fn start_sync() -> Result<web_sys::ReadableStream, HarmonyError> {
    start_sync_impl().await
}

#[wasm_bindgen(js_name = stopSync)]
pub async fn stop_sync() -> Result<(), HarmonyError> {
    stop_sync_impl().await
}

#[wasm_bindgen(js_name = subscribeSpaces)]
pub async fn subscribe_spaces() -> Result<JsValue, JsValue> {
    subscribe_spaces_impl().await?.try_into()
}

#[wasm_bindgen(js_name = getSpaces)]
pub async fn get_spaces() -> Result<Vec<SpaceData>, HarmonyError> {
    get_spaces_impl().await
}

#[wasm_bindgen(js_name = createSpace)]
pub async fn create_space(
    name: &str,
    avatar_bytes: Option<Vec<u8>>,
    avatar_content_type: Option<String>,
) -> Result<SpaceData, HarmonyError> {
    create_space_impl(name, avatar_bytes, avatar_content_type).await
}

#[wasm_bindgen(js_name = joinSpace)]
pub async fn join_space(space_id: &str) -> Result<SpaceData, HarmonyError> {
    join_space_impl(space_id).await
}

#[wasm_bindgen(js_name = createRoom)]
pub async fn create_room(
    space_id: &str,
    name: &str,
    visibility: ChannelVisibility,
) -> Result<RoomData, HarmonyError> {
    create_room_impl(space_id, name, visibility).await
}

#[wasm_bindgen(js_name = subscribeRoomList)]
pub async fn subscribe_room_list() -> Result<web_sys::ReadableStream, HarmonyError> {
    subscribe_room_list_impl().await
}

#[wasm_bindgen(js_name = setRoomFilter)]
pub fn set_room_filter(room_ids: Vec<String>) -> Result<(), HarmonyError> {
    set_room_filter_impl(room_ids)
}

#[wasm_bindgen(js_name = getRoomMembers)]
pub async fn get_room_members(room_id: &str) -> Result<Vec<MemberData>, HarmonyError> {
    get_room_members_impl(room_id).await
}

#[wasm_bindgen(js_name = subscribeSpaceFilters)]
pub async fn subscribe_space_filters() -> Result<JsValue, JsValue> {
    subscribe_space_filters_impl().await?.try_into()
}

#[wasm_bindgen(js_name = subscribeTimeline)]
pub async fn subscribe_timeline(room_id: &str) -> Result<JsValue, JsValue> {
    subscribe_timeline_impl(room_id).await?.try_into()
}

#[wasm_bindgen(js_name = sendMessage)]
pub async fn send_message(
    room_id: &str,
    body: &str,
    formatted_body: Option<String>,
) -> Result<(), HarmonyError> {
    send_message_impl(room_id, body, formatted_body.as_deref()).await
}

#[wasm_bindgen(js_name = editMessage)]
pub async fn edit_message(
    room_id: &str,
    event_id: Option<String>,
    transaction_id: Option<String>,
    body: &str,
    formatted_body: Option<String>,
) -> Result<(), HarmonyError> {
    edit_message_impl(
        room_id,
        event_id.as_deref(),
        transaction_id.as_deref(),
        body,
        formatted_body.as_deref(),
    )
    .await
}

#[wasm_bindgen(js_name = paginateBackwards)]
pub async fn paginate_backwards(room_id: &str, count: u16) -> Result<bool, HarmonyError> {
    paginate_backwards_impl(room_id, count).await
}

#[wasm_bindgen(js_name = toggleReaction)]
pub async fn toggle_reaction(
    room_id: &str,
    event_id: Option<String>,
    transaction_id: Option<String>,
    key: &str,
) -> Result<bool, HarmonyError> {
    toggle_reaction_impl(room_id, event_id.as_deref(), transaction_id.as_deref(), key).await
}

#[wasm_bindgen(js_name = redactMessage)]
pub async fn redact_message(
    room_id: &str,
    event_id: Option<String>,
    transaction_id: Option<String>,
) -> Result<(), HarmonyError> {
    redact_message_impl(room_id, event_id.as_deref(), transaction_id.as_deref()).await
}

#[wasm_bindgen(js_name = markAsRead)]
pub async fn mark_as_read(room_id: &str) -> Result<(), HarmonyError> {
    mark_as_read_impl(room_id).await
}

#[wasm_bindgen(js_name = getTimeline)]
pub async fn get_timeline(room_id: &str) -> Result<Vec<TimelineEventData>, HarmonyError> {
    get_timeline_impl(room_id).await
}
