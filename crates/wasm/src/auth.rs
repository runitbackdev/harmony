use matrix_sdk::{
    Client, SessionMeta, SessionTokens,
    authentication::matrix::MatrixSession,
    ruma::{OwnedDeviceId, OwnedUserId},
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};
use tsify_next::Tsify;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{client, errors::HarmonyError};

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
pub struct LoginRequest {
    pub homeserver: String,
    pub username: String,
    pub password: String,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub homeserver: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[instrument(skip_all, fields(homeserver = %request.homeserver, username = %request.username))]
pub async fn login_impl(request: &LoginRequest) -> Result<SessionData, HarmonyError> {
    let auth_client = Client::builder()
        .homeserver_url(&request.homeserver)
        .indexeddb_store("harmony", None)
        .build()
        .await?;

    auth_client
        .matrix_auth()
        .login_username(&request.username, &request.password)
        .send()
        .await?;

    let session = auth_client
        .matrix_auth()
        .session()
        .ok_or(HarmonyError::AuthFailed)?;

    let auth_session = SessionData {
        homeserver: request.homeserver.clone(),
        user_id: session.meta.user_id.to_string(),
        device_id: session.meta.device_id.to_string(),
        access_token: session.tokens.access_token,
        refresh_token: None,
    };

    client::set(auth_client)?;

    info!(user_id = %auth_session.user_id, "login successful");
    Ok(auth_session)
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRequest {
    pub homeserver: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[instrument(skip_all, fields(homeserver = %request.homeserver, user_id = %request.user_id))]
pub async fn restore_impl(request: &RestoreRequest) -> Result<SessionData, HarmonyError> {
    if client::get().is_some() {
        return Ok(SessionData {
            homeserver: request.homeserver.clone(),
            user_id: request.user_id.clone(),
            device_id: request.device_id.clone(),
            access_token: request.access_token.clone(),
            refresh_token: request.refresh_token.clone(),
        });
    }

    let auth_client = Client::builder()
        .homeserver_url(&request.homeserver)
        .indexeddb_store("harmony", None)
        .build()
        .await?;

    let user_id: OwnedUserId = request
        .user_id
        .parse()
        .map_err(|_| HarmonyError::InvalidUserId)?;
    let device_id: OwnedDeviceId = request.device_id.clone().into();

    let session = MatrixSession {
        meta: SessionMeta { user_id, device_id },
        tokens: SessionTokens {
            access_token: request.access_token.clone(),
            refresh_token: request.refresh_token.clone(),
        },
    };

    auth_client.restore_session(session).await?;

    let data = SessionData {
        homeserver: request.homeserver.clone(),
        user_id: request.user_id.clone(),
        device_id: request.device_id.clone(),
        access_token: request.access_token.clone(),
        refresh_token: request.refresh_token.clone(),
    };

    client::set(auth_client)?;

    Ok(data)
}

#[instrument(skip_all)]
pub async fn logout_impl() -> Result<(), HarmonyError> {
    let client = client::get().ok_or(HarmonyError::AuthFailed)?;

    client.matrix_auth().logout().await?;

    client::clear();

    Ok(())
}
