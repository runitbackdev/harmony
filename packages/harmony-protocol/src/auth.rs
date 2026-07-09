use matrix_sdk::{
    Client, ClientBuilder, SessionMeta, SessionTokens,
    authentication::matrix::MatrixSession,
    ruma::{OwnedDeviceId, OwnedUserId},
};
use tracing::{info, instrument};

use crate::{Command, Rpc, client, harmony, harmony_export, internal_error::InternalError};

#[harmony]
pub struct LoginRequest {
    pub homeserver: String,
    pub username: String,
    pub password: String,
}

#[harmony]
pub struct SessionData {
    pub homeserver: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[harmony]
pub struct RestoreRequest {
    pub homeserver: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

/// Attach the per-target persistent store. Wasm uses `IndexedDB`; native uses
/// `SQLite`. Wider client builder configuration stays portable.
fn with_store(builder: ClientBuilder) -> ClientBuilder {
    #[cfg(target_arch = "wasm32")]
    {
        builder.indexeddb_store("harmony", None)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // Must live on a local filesystem: SQLite's file locks are unreliable
        // over network mounts (e.g. WSL2's 9p), surfacing as `database is locked`.
        let store = dirs::data_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("harmony");
        builder.sqlite_store(store, None)
    }
}

#[harmony_export(domain = "auth")]
pub async fn login(request: LoginRequest) -> Rpc<SessionData> {
    login_impl(&request).await.into()
}

#[instrument(skip_all, fields(homeserver = %request.homeserver, username = %request.username))]
async fn login_impl(request: &LoginRequest) -> Result<SessionData, InternalError> {
    info!("building client (discover + supported versions)");
    let auth_client = with_store(Client::builder().homeserver_url(&request.homeserver))
        .build()
        .await?;

    info!("client built; sending login request");
    auth_client
        .matrix_auth()
        .login_username(&request.username, &request.password)
        .send()
        .await?;
    info!("login request returned");

    let session = auth_client
        .matrix_auth()
        .session()
        .ok_or(InternalError::AuthFailed)?;

    let auth_session = SessionData {
        homeserver: request.homeserver.clone(),
        user_id: session.meta.user_id.to_string(),
        device_id: session.meta.device_id.to_string(),
        access_token: session.tokens.access_token,
        refresh_token: None,
    };

    auth_client.send_queue().set_enabled(true).await;
    client::set(auth_client)?;

    info!(user_id = %auth_session.user_id, "login successful");
    Ok(auth_session)
}

#[harmony_export(domain = "auth", action = "restore")]
pub async fn restore_session(request: RestoreRequest) -> Rpc<SessionData> {
    restore_impl(&request).await.into()
}

#[instrument(skip_all, fields(homeserver = %request.homeserver, user_id = %request.user_id))]
async fn restore_impl(request: &RestoreRequest) -> Result<SessionData, InternalError> {
    if client::get().is_some() {
        return Ok(SessionData {
            homeserver: request.homeserver.clone(),
            user_id: request.user_id.clone(),
            device_id: request.device_id.clone(),
            access_token: request.access_token.clone(),
            refresh_token: request.refresh_token.clone(),
        });
    }

    let auth_client = with_store(Client::builder().homeserver_url(&request.homeserver))
        .build()
        .await?;

    let user_id: OwnedUserId = request
        .user_id
        .parse()
        .map_err(|_| InternalError::InvalidUserId)?;
    let device_id: OwnedDeviceId = request.device_id.clone().into();

    let session = MatrixSession {
        meta: SessionMeta { user_id, device_id },
        tokens: SessionTokens {
            access_token: request.access_token.clone(),
            refresh_token: request.refresh_token.clone(),
        },
    };

    auth_client.restore_session(session).await?;
    auth_client.send_queue().set_enabled(true).await;

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

#[harmony_export(domain = "auth")]
pub async fn logout() -> Command {
    logout_impl().await.into()
}

#[instrument(skip_all)]
async fn logout_impl() -> Result<(), InternalError> {
    let client = client::get().ok_or(InternalError::AuthFailed)?;
    client.matrix_auth().logout().await?;
    client::clear();
    Ok(())
}
