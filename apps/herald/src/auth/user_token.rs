use std::time::Duration;

use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use moka::future::Cache;
use serde_json::json;

use crate::auth::bearer_from_headers;
use crate::matrix::{AuthError, Identity, MatrixClient};

#[derive(Clone)]
pub struct TokenCache {
    client: MatrixClient,
    cache: Cache<String, Identity>,
}

impl TokenCache {
    pub fn new(client: MatrixClient, ttl: Duration, max_capacity: u64) -> Self {
        let cache = Cache::builder()
            .max_capacity(max_capacity)
            .time_to_live(ttl)
            .build();
        Self { client, cache }
    }

    pub async fn resolve(&self, token: &str) -> Result<Identity, AuthError> {
        let client = self.client.clone();
        let token_key = token.to_string();
        self.cache
            .try_get_with(
                token_key.clone(),
                async move { client.whoami(&token_key).await },
            )
            .await
            .map_err(|arc| (*arc).clone())
    }
}

pub async fn require_user(
    State(tokens): State<TokenCache>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Response {
    let Some(token) = bearer_from_headers(&headers) else {
        return unauthorized();
    };

    match tokens.resolve(token).await {
        Ok(identity) => {
            req.extensions_mut().insert(identity);
            next.run(req).await
        }
        Err(AuthError::Invalid) => unauthorized(),
        Err(AuthError::Forbidden) => forbidden(),
        Err(AuthError::RateLimited(ms)) => rate_limited(ms),
        Err(AuthError::Upstream) => upstream(),
    }
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "errcode": "M_UNKNOWN_TOKEN",
            "error": "Invalid access token",
        })),
    )
        .into_response()
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({
            "errcode": "M_FORBIDDEN",
            "error": "Forbidden",
        })),
    )
        .into_response()
}

fn rate_limited(retry_after_ms: u64) -> Response {
    let retry_after_secs = retry_after_ms.div_ceil(1000).max(1);
    (
        StatusCode::TOO_MANY_REQUESTS,
        [(header::RETRY_AFTER, retry_after_secs.to_string())],
        Json(json!({
            "errcode": "M_LIMIT_EXCEEDED",
            "retry_after_ms": retry_after_ms,
        })),
    )
        .into_response()
}

fn upstream() -> Response {
    (
        StatusCode::BAD_GATEWAY,
        Json(json!({
            "errcode": "M_UNKNOWN",
            "error": "Homeserver unavailable",
        })),
    )
        .into_response()
}
