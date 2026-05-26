use harmony_protocol::HarmonyError as WireError;
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

    #[error("Client not ready")]
    ClientNotReady,

    #[error("Room not found")]
    RoomNotFound,

    #[error("Invalid room ID format")]
    InvalidRoomId,

    #[error("Invalid event ID format")]
    InvalidEventId,

    #[error("serialization failed")]
    SerializationFailed,

    #[error("Invalid content type")]
    InvalidContentType,

    #[error("{0}")]
    ClientBuildError(#[from] ClientBuildError),

    #[error("{0}")]
    HttpError(#[from] matrix_sdk::HttpError),

    #[error("{0}")]
    MatrixError(#[from] matrix_sdk::Error),

    #[error("{0}")]
    TimelineError(#[from] matrix_sdk_ui::timeline::Error),

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
            Self::ClientNotReady => "client_not_ready",
            Self::RoomNotFound => "room_not_found",
            Self::InvalidRoomId => "invalid_room_id",
            Self::InvalidEventId => "invalid_event_id",
            Self::SerializationFailed => "serialization_failed",
            Self::InvalidContentType => "invalid_content_type",
            Self::TimelineError(_) | Self::Sync(_) | Self::ClientAlreadyInitialized => "unknown",
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

impl From<HarmonyError> for WireError {
    fn from(err: HarmonyError) -> Self {
        let message = err.to_string();
        match err {
            HarmonyError::AuthFailed => Self::AuthFailed,
            HarmonyError::InvalidUserId => Self::InvalidUserId,
            HarmonyError::InvalidRoomId => Self::InvalidRoomId,
            HarmonyError::InvalidEventId => Self::InvalidEventId,
            HarmonyError::InvalidContentType => Self::InvalidContentType,
            HarmonyError::ClientNotReady => Self::ClientNotReady,
            HarmonyError::ClientAlreadyInitialized => Self::ClientAlreadyInitialized,
            HarmonyError::RoomNotFound => Self::RoomNotFound,
            HarmonyError::SerializationFailed => Self::SerializationFailed { message },
            HarmonyError::ClientBuildError(_) => Self::ServerNotFound,
            HarmonyError::HttpError(e) => match classify_api_error(e.client_api_error_kind()) {
                "invalid_credentials" => Self::InvalidCredentials,
                "rate_limited" => Self::RateLimited,
                _ => Self::NetworkError { message },
            },
            HarmonyError::MatrixError(e) => match classify_api_error(e.client_api_error_kind()) {
                "invalid_credentials" => Self::InvalidCredentials,
                "rate_limited" => Self::RateLimited,
                _ => Self::Unknown { message },
            },
            HarmonyError::TimelineError(_) | HarmonyError::Sync(_) => Self::Unknown { message },
        }
    }
}
