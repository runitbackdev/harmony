use matrix_sdk::ClientBuildError;
use matrix_sdk::ruma::api::client::error::ErrorKind;
use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Error, Debug)]
pub enum HarmonyError {
    #[error("Authentication failed. Please try again.")]
    AuthFailed,

    #[error("Invalid user ID format")]
    InvalidUserId,

    #[error("Client already initialized")]
    ClientAlreadyInitialized,

    #[error("{0}")]
    ClientBuildError(#[from] ClientBuildError),

    #[error("{0}")]
    HttpError(#[from] matrix_sdk::HttpError),

    #[error("{0}")]
    MatrixError(#[from] matrix_sdk::Error),

    #[error("{0}")]
    Sync(String),
}

impl HarmonyError {
    fn error_code(&self) -> &str {
        match self {
            Self::AuthFailed => "invalid_credentials",
            Self::InvalidUserId => "invalid_user_id",
            Self::ClientBuildError(_) => "server_not_found",
            Self::HttpError(e) => classify_api_error(e.client_api_error_kind()),
            Self::MatrixError(e) => classify_api_error(e.client_api_error_kind()),
            Self::Sync(_) | Self::ClientAlreadyInitialized => "unknown",
        }
    }
}

const fn classify_api_error(kind: Option<&ErrorKind>) -> &str {
    match kind {
        Some(
            ErrorKind::Forbidden { .. }
            | ErrorKind::Unauthorized
            | ErrorKind::UserDeactivated
            | ErrorKind::UnknownToken { .. }
            | ErrorKind::MissingToken,
        ) => "invalid_credentials",
        Some(ErrorKind::LimitExceeded { .. }) => "rate_limited",
        _ => "unknown",
    }
}

#[allow(clippy::use_self)]
impl From<HarmonyError> for JsValue {
    fn from(err: HarmonyError) -> JsValue {
        let obj = js_sys::Object::new();
        let code = JsValue::from_str(err.error_code());
        let message = JsValue::from_str(&err.to_string());
        js_sys::Reflect::set(&obj, &"code".into(), &code).ok();
        js_sys::Reflect::set(&obj, &"message".into(), &message).ok();
        obj.into()
    }
}
