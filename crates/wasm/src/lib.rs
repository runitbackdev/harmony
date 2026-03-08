#![allow(clippy::future_not_send)]

use wasm_bindgen::prelude::*;

use crate::{
    auth::{LoginRequest, RestoreRequest, SessionData, login_impl, logout_impl, restore_impl},
    errors::HarmonyError,
    rooms::{RoomData, get_space_rooms_impl, subscribe_space_rooms_impl},
    spaces::{SpaceData, create_space_impl, get_spaces_impl, subscribe_spaces_impl},
    sync::{start_sync_impl, stop_sync_impl},
    timeline::{TimelineEventData, get_timeline_impl, subscribe_timeline_impl},
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
pub async fn create_space(name: &str) -> Result<SpaceData, HarmonyError> {
    create_space_impl(name).await
}

#[wasm_bindgen(js_name = subscribeSpaceRooms)]
pub async fn subscribe_space_rooms(space_id: &str) -> Result<JsValue, JsValue> {
    subscribe_space_rooms_impl(space_id).await?.try_into()
}

#[wasm_bindgen(js_name = getSpaceRooms)]
pub fn get_space_rooms(space_id: &str) -> Result<Vec<RoomData>, HarmonyError> {
    get_space_rooms_impl(space_id)
}

#[wasm_bindgen(js_name = subscribeTimeline)]
pub async fn subscribe_timeline(room_id: &str) -> Result<JsValue, JsValue> {
    subscribe_timeline_impl(room_id).await?.try_into()
}

#[wasm_bindgen(js_name = getTimeline)]
pub async fn get_timeline(room_id: &str) -> Result<Vec<TimelineEventData>, HarmonyError> {
    get_timeline_impl(room_id).await
}
