use matrix_sdk::Client;
use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

use crate::{client, errors::HarmonyError};

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
pub struct LoginRequest {
    pub homeserver: String,
    pub username: String,
    pub password: String,
}

pub type UserId = String;

pub async fn login_impl(request: &LoginRequest) -> Result<UserId, HarmonyError> {
    let auth_client = Client::builder()
        .homeserver_url(&request.homeserver)
        .build()
        .await?;

    auth_client
        .matrix_auth()
        .login_username(&request.username, &request.password)
        .send()
        .await?;

    let user_id = auth_client
        .user_id()
        .ok_or(HarmonyError::AuthFailed)?
        .to_string();

    client::set(auth_client)?;

    Ok(user_id)
}
