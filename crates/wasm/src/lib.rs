use wasm_bindgen::prelude::*;

use crate::auth::{
    LoginRequest, RestoreRequest, SessionData, login_impl, logout_impl, restore_impl,
};

mod auth;
mod client;
mod errors;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default();
}

#[wasm_bindgen]
pub async fn login(request: LoginRequest) -> Result<SessionData, JsValue> {
    Ok(login_impl(&request).await?)
}

#[wasm_bindgen(js_name = restoreSession)]
pub async fn restore_session(request: RestoreRequest) -> Result<SessionData, JsValue> {
    Ok(restore_impl(&request).await?)
}

#[wasm_bindgen]
pub async fn logout() -> Result<(), JsValue> {
    Ok(logout_impl().await?)
}
