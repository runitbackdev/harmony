use matrix_sdk::ClientBuildError;
use matrix_sdk::ruma::api::client::error::ErrorKind;
use thiserror::Error;

use crate::HarmonyError as WireError;

#[derive(Error, Debug)]
pub enum InternalError {
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

    #[error("Invalid content type")]
    MimeTypeError,

    #[error("Invalid reply event ID")]
    ReplyFailed,

    #[error("{0}")]
    SendFailed(String),

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

impl From<InternalError> for WireError {
    fn from(err: InternalError) -> Self {
        let message = err.to_string();
        match err {
            InternalError::AuthFailed => Self::AuthFailed,
            InternalError::InvalidUserId => Self::InvalidUserId,
            InternalError::InvalidRoomId => Self::InvalidRoomId,
            InternalError::InvalidEventId => Self::InvalidEventId,
            InternalError::InvalidContentType | InternalError::MimeTypeError => {
                Self::InvalidContentType
            }
            InternalError::ClientNotReady => Self::ClientNotReady,
            InternalError::ClientAlreadyInitialized => Self::ClientAlreadyInitialized,
            InternalError::RoomNotFound => Self::RoomNotFound,
            InternalError::SerializationFailed => Self::SerializationFailed { message },
            InternalError::HttpError(e) => match classify_api_error(e.client_api_error_kind()) {
                "invalid_credentials" => Self::InvalidCredentials,
                "rate_limited" => Self::RateLimited,
                _ => Self::NetworkError { message },
            },
            InternalError::MatrixError(e) => match classify_api_error(e.client_api_error_kind()) {
                "invalid_credentials" => Self::InvalidCredentials,
                "rate_limited" => Self::RateLimited,
                _ => Self::Unknown { message },
            },
            InternalError::ReplyFailed
            | InternalError::SendFailed(_)
            | InternalError::TimelineError(_)
            | InternalError::Sync(_)
            | InternalError::ClientBuildError(_) => Self::Unknown { message },
        }
    }
}
