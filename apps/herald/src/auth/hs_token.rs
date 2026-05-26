use axum::{
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use subtle::ConstantTimeEq;

use crate::auth::bearer_from_headers;
use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct AccessTokenQuery {
    access_token: Option<String>,
}

pub async fn verify(
    State(config): State<Config>,
    Query(query): Query<AccessTokenQuery>,
    headers: HeaderMap,
    req: Request,
    next: Next,
) -> Response {
    let token = bearer_from_headers(&headers).or(query.access_token.as_deref());

    let Some(token) = token else {
        return forbidden();
    };

    if token.as_bytes().ct_eq(config.hs_token.as_bytes()).into() {
        next.run(req).await
    } else {
        forbidden()
    }
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({
            "errcode": "M_FORBIDDEN",
            "error": "Bad homeserver token",
        })),
    )
        .into_response()
}
