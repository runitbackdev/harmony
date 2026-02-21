#![allow(clippy::future_not_send)]

use wasm_bindgen::prelude::*;

use crate::{
    auth::{LoginRequest, RestoreRequest, SessionData, login_impl, logout_impl, restore_impl},
    errors::HarmonyError,
    spaces::{SpaceData, get_spaces_impl, subscribe_spaces_impl},
    sync::{start_sync_impl, stop_sync_impl},
};

mod auth;
mod client;
mod diff;
mod errors;
mod spaces;
mod subscription;
mod sync;

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
