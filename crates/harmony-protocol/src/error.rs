use serde::{Deserialize, Serialize};
use thiserror::Error;
use tsify::Tsify;

/// Universal error type carried by `Rpc<T>` and `Command` across the
/// Harmony bridge. Serialized as a `{ code, ... }` discriminated union.
#[derive(Tsify, Serialize, Deserialize, Error, Debug, Clone)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum HarmonyError {
    #[error("invalid credentials")]
    InvalidCredentials,

    #[error("server not found")]
    ServerNotFound,

    #[error("network error: {message}")]
    NetworkError { message: String },

    #[error("rate limited")]
    RateLimited,

    #[error("authentication failed")]
    AuthFailed,

    #[error("room not found")]
    RoomNotFound,

    #[error("invalid user id")]
    InvalidUserId,

    #[error("invalid room id")]
    InvalidRoomId,

    #[error("invalid event id")]
    InvalidEventId,

    #[error("invalid content type")]
    InvalidContentType,

    #[error("client not ready")]
    ClientNotReady,

    #[error("client already initialized")]
    ClientAlreadyInitialized,

    #[error("serialization failed: {message}")]
    SerializationFailed { message: String },

    #[error("unknown error: {message}")]
    Unknown { message: String },
}
