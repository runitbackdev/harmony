#![allow(clippy::future_not_send)]

use wasm_bindgen::prelude::*;

use crate::{
    auth::{LoginRequest, RestoreRequest, SessionData, login_impl, logout_impl, restore_impl},
    errors::HarmonyError,
    rooms::{
        MemberData, RoomData, RoomDataWithSpace, get_all_rooms_impl, get_room_members_impl,
        subscribe_room_members_impl, subscribe_rooms_in_space_impl,
        unsubscribe_rooms_in_space_impl,
    },
    spaces::{
        ChannelVisibility, SpaceData, create_room_impl, create_space_impl,
        get_space_descendants_impl, get_spaces_impl, join_space_impl, subscribe_spaces_impl,
    },
    sync::{start_sync_impl, stop_sync_impl},
    timeline::{
        ModeSwapResult, PaginateResult, PaginationDirection, RoomStateSnapshot, edit_message_impl,
        focus_on_event_impl, get_room_state_impl, mark_as_read_impl, paginate_room_impl,
        redact_message_impl, return_to_live_impl, send_message_impl, subscribe_room_impl,
        toggle_reaction_impl, unsubscribe_room_impl,
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

#[wasm_bindgen(js_name = subscribeRoomsInSpace)]
pub async fn subscribe_rooms_in_space(space_id: String) -> Result<JsValue, JsValue> {
    subscribe_rooms_in_space_impl(space_id).await
}

#[wasm_bindgen(js_name = getAllRooms)]
pub async fn get_all_rooms() -> Result<Vec<RoomDataWithSpace>, HarmonyError> {
    get_all_rooms_impl().await
}

#[wasm_bindgen(js_name = unsubscribeRoomsInSpace)]
pub fn unsubscribe_rooms_in_space(id: u32) {
    unsubscribe_rooms_in_space_impl(id);
}

#[wasm_bindgen(js_name = getRoomMembers)]
pub async fn get_room_members(room_id: &str) -> Result<Vec<MemberData>, HarmonyError> {
    get_room_members_impl(room_id).await
}

#[wasm_bindgen(js_name = subscribeRoomMembers)]
pub async fn subscribe_room_members(room_id: &str) -> Result<JsValue, JsValue> {
    subscribe_room_members_impl(room_id).await?.try_into()
}

#[wasm_bindgen(js_name = getSpaceDescendants)]
pub async fn get_space_descendants(space_id: String) -> Result<Vec<String>, HarmonyError> {
    get_space_descendants_impl(space_id).await
}

#[wasm_bindgen(js_name = subscribeRoom)]
pub async fn subscribe_room(room_id: &str) -> Result<JsValue, JsValue> {
    subscribe_room_impl(room_id).await?.try_into()
}

#[wasm_bindgen(js_name = unsubscribeRoom)]
pub fn unsubscribe_room(room_id: &str) -> Result<(), HarmonyError> {
    unsubscribe_room_impl(room_id)
}

#[wasm_bindgen(js_name = focusOnEvent)]
pub async fn focus_on_event(
    room_id: &str,
    target_event_id: &str,
    num_context_events: Option<u16>,
) -> Result<ModeSwapResult, HarmonyError> {
    focus_on_event_impl(room_id, target_event_id, num_context_events).await
}

#[wasm_bindgen(js_name = returnToLive)]
pub async fn return_to_live(room_id: &str) -> Result<ModeSwapResult, HarmonyError> {
    return_to_live_impl(room_id).await
}

#[wasm_bindgen(js_name = sendMessage)]
pub async fn send_message(
    room_id: &str,
    body: &str,
    formatted_body: Option<String>,
    reply_to_event_id: Option<String>,
) -> Result<(), HarmonyError> {
    send_message_impl(
        room_id,
        body,
        formatted_body.as_deref(),
        reply_to_event_id.as_deref(),
    )
    .await
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

#[wasm_bindgen(js_name = paginateRoom)]
pub async fn paginate_room(
    room_id: &str,
    direction: PaginationDirection,
    count: u16,
) -> Result<PaginateResult, HarmonyError> {
    paginate_room_impl(room_id, direction, count).await
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

#[wasm_bindgen(js_name = getRoomState)]
pub async fn get_room_state(room_id: &str) -> Result<RoomStateSnapshot, HarmonyError> {
    get_room_state_impl(room_id).await
}
