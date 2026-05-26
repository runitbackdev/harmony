use std::borrow::Cow;
use std::collections::BTreeSet;
use std::sync::Arc;

use ruma::api::auth_scheme::SendAccessToken;
use ruma::api::client::account::whoami;
use ruma::api::client::membership::{invite_user, join_room_by_id, joined_members, joined_rooms};
use ruma::api::client::space::{get_hierarchy, SpaceHierarchyRoomsChunk};
use ruma::api::client::state::get_state_event_for_key;
use ruma::api::{
    AppserviceUserIdentity, IncomingResponse, MatrixVersion, OutgoingRequest,
    OutgoingRequestAppserviceExt, SupportedVersions,
};
use ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use ruma::events::StateEventType;
use ruma::UInt;
use ruma::{OwnedDeviceId, OwnedRoomId, OwnedUserId, RoomId, UserId};
use url::Url;

#[derive(Debug, Clone)]
pub struct Identity {
    pub user_id: OwnedUserId,
    pub device_id: Option<OwnedDeviceId>,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum AuthError {
    #[error("invalid token")]
    Invalid,
    #[error("forbidden")]
    Forbidden,
    #[error("rate limited: retry after {0}ms")]
    RateLimited(u64),
    #[error("homeserver unavailable")]
    Upstream,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum MatrixError {
    #[error("matrix request build failed: {0}")]
    Build(String),
    #[error("matrix request transport failed: {0}")]
    Transport(String),
    #[error("matrix response decode failed: {0}")]
    Decode(String),
    #[error("matrix endpoint returned error: status {status}")]
    Endpoint { status: u16, body: String },
}

#[derive(Debug, Clone)]
pub struct SpacePreview {
    pub name: String,
    pub member_count: u64,
}

#[derive(Clone)]
pub struct MatrixClient {
    http: reqwest::Client,
    homeserver: Url,
    as_token: Arc<str>,
    supported: Arc<SupportedVersions>,
}

impl MatrixClient {
    pub fn new(homeserver: Url, as_token: String) -> Self {
        let supported = SupportedVersions {
            versions: BTreeSet::from([MatrixVersion::V1_11]),
            features: BTreeSet::new(),
        };
        Self {
            http: reqwest::Client::new(),
            homeserver,
            as_token: as_token.into(),
            supported: Arc::new(supported),
        }
    }

    pub async fn whoami(&self, access_token: &str) -> Result<Identity, AuthError> {
        let url = self
            .homeserver
            .join("/_matrix/client/v3/account/whoami")
            .map_err(|_| AuthError::Upstream)?;

        let resp = self
            .http
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|_| AuthError::Upstream)?;

        match resp.status().as_u16() {
            200 => {
                let bytes = resp.bytes().await.map_err(|_| AuthError::Upstream)?;
                let http_resp = http::Response::builder()
                    .status(http::StatusCode::OK)
                    .body(bytes.to_vec())
                    .map_err(|_| AuthError::Upstream)?;
                let body = whoami::v3::Response::try_from_http_response(http_resp)
                    .map_err(|_| AuthError::Upstream)?;
                Ok(Identity {
                    user_id: body.user_id,
                    device_id: body.device_id,
                })
            }
            401 => Err(AuthError::Invalid),
            403 => Err(AuthError::Forbidden),
            429 => {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();
                let ms = body
                    .get("retry_after_ms")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(1000);
                Err(AuthError::RateLimited(ms))
            }
            _ => Err(AuthError::Upstream),
        }
    }

    pub async fn joined_members(&self, room_id: &RoomId) -> Result<Vec<OwnedUserId>, MatrixError> {
        let req = joined_members::v3::Request::new(room_id.to_owned());
        let resp = self.send_as(req, None).await?;
        Ok(resp.joined.into_keys().collect())
    }

    pub async fn joined_rooms(&self, user_id: &UserId) -> Result<Vec<OwnedRoomId>, MatrixError> {
        let req = joined_rooms::v3::Request::new();
        let resp = self.send_as(req, Some(user_id)).await?;
        Ok(resp.joined_rooms)
    }

    pub async fn join_room(&self, room_id: &RoomId, as_user: &UserId) -> Result<(), MatrixError> {
        let req = join_room_by_id::v3::Request::new(room_id.to_owned());
        let _ = self.send_as(req, Some(as_user)).await?;
        Ok(())
    }

    pub async fn power_levels(
        &self,
        room_id: &RoomId,
        as_user: &UserId,
    ) -> Result<RoomPowerLevelsEventContent, MatrixError> {
        let req = get_state_event_for_key::v3::Request::new(
            room_id.to_owned(),
            StateEventType::RoomPowerLevels,
            String::new(),
        );
        let resp = self.send_as(req, Some(as_user)).await?;
        resp.into_content()
            .deserialize_as_unchecked::<RoomPowerLevelsEventContent>()
            .map_err(|e| MatrixError::Decode(e.to_string()))
    }

    pub async fn invite_to_space(
        &self,
        space_id: &RoomId,
        user_id: &UserId,
        as_user: &UserId,
    ) -> Result<(), MatrixError> {
        let req = invite_user::v3::Request::new(
            space_id.to_owned(),
            invite_user::v3::InviteUserId::new(user_id.to_owned()).into(),
        );
        let _ = self.send_as(req, Some(as_user)).await?;
        Ok(())
    }

    /// Paginates `GET /_matrix/client/v1/rooms/{room_id}/hierarchy`.
    /// One of the returned chunks describes the space itself; the rest
    /// are reachable child rooms — callers must locate the root by `room_id`.
    /// `max_depth` and `suggested_only` are forwarded to the server (see
    /// MSC2946); after the first page these are fixed by the homeserver.
    pub async fn space_hierarchy(
        &self,
        space_id: &RoomId,
        as_user: &UserId,
        max_depth: Option<UInt>,
        suggested_only: bool,
    ) -> Result<Vec<SpaceHierarchyRoomsChunk>, MatrixError> {
        const MAX_PAGES: usize = 32;
        let mut rooms = Vec::new();
        let mut from: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut req = get_hierarchy::v1::Request::new(space_id.to_owned());
            req.from = from.clone();
            req.max_depth = max_depth;
            req.suggested_only = suggested_only;
            let resp = self.send_as(req, Some(as_user)).await?;
            rooms.extend(resp.rooms);
            match resp.next_batch {
                // Guard against a server that returns the same token forever.
                Some(token) if Some(&token) != from.as_ref() => from = Some(token),
                _ => return Ok(rooms),
            }
        }
        tracing::warn!(space = %space_id, "space_hierarchy hit page cap; returning partial result");
        Ok(rooms)
    }

    pub async fn space_preview(
        &self,
        room_id: &RoomId,
        as_user: &UserId,
    ) -> Result<SpacePreview, MatrixError> {
        let mut url = self.homeserver.clone();
        {
            let mut segs = url
                .path_segments_mut()
                .map_err(|()| MatrixError::Build("homeserver url has no path".into()))?;
            segs.pop_if_empty().extend(&[
                "_matrix",
                "client",
                "unstable",
                "im.nheko.summary",
                "summary",
                room_id.as_str(),
            ]);
        }
        url.query_pairs_mut()
            .append_pair("user_id", as_user.as_str());

        let resp = self
            .http
            .get(url)
            .bearer_auth(&*self.as_token)
            .send()
            .await
            .map_err(|e| MatrixError::Transport(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(MatrixError::Endpoint { status, body });
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| MatrixError::Decode(e.to_string()))?;

        Ok(SpacePreview {
            name: body
                .get("name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Unknown Space")
                .to_owned(),
            member_count: body
                .get("num_joined_members")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0),
        })
    }

    async fn send_as<R>(
        &self,
        request: R,
        as_user: Option<&UserId>,
    ) -> Result<R::IncomingResponse, MatrixError>
    where
        R: OutgoingRequest + OutgoingRequestAppserviceExt,
        for<'a> R::Authentication:
            ruma::api::auth_scheme::AuthScheme<Input<'a> = SendAccessToken<'a>>,
        for<'a> <R::PathBuilder as ruma::api::path_builder::PathBuilder>::Input<'a>:
            From<Cow<'a, SupportedVersions>>,
    {
        let supported = Cow::Borrowed(self.supported.as_ref());
        let path_input = supported.into();
        let access_token = SendAccessToken::IfRequired(&self.as_token);

        let http_req = if let Some(user) = as_user {
            let identity = AppserviceUserIdentity::new(user);
            request
                .try_into_http_request_with_identity::<Vec<u8>>(
                    self.homeserver.as_str(),
                    access_token,
                    identity,
                    path_input,
                )
                .map_err(|e| MatrixError::Build(e.to_string()))?
        } else {
            request
                .try_into_http_request::<Vec<u8>>(
                    self.homeserver.as_str(),
                    access_token,
                    path_input,
                )
                .map_err(|e| MatrixError::Build(e.to_string()))?
        };

        let reqwest_req = reqwest::Request::try_from(http_req)
            .map_err(|e| MatrixError::Transport(e.to_string()))?;

        let resp = self
            .http
            .execute(reqwest_req)
            .await
            .map_err(|e| MatrixError::Transport(e.to_string()))?;

        let status = resp.status();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| MatrixError::Transport(e.to_string()))?;

        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes).into_owned();
            return Err(MatrixError::Endpoint {
                status: status.as_u16(),
                body,
            });
        }

        let http_resp = http::Response::builder()
            .status(status)
            .body(bytes.to_vec())
            .map_err(|e| MatrixError::Build(e.to_string()))?;

        R::IncomingResponse::try_from_http_response(http_resp)
            .map_err(|e| MatrixError::Decode(format!("{e:?}")))
    }
}
