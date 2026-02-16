use wasm_bindgen::prelude::*;

use crate::auth::{LoginRequest, UserId, login_impl};

mod auth;
mod client;
mod errors;

#[allow(unused)]
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[wasm_bindgen]
pub async fn login(request: LoginRequest) -> Result<UserId, JsError> {
    let user_id = login_impl(&request).await?;

    Ok(user_id)
}
