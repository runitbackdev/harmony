use axum::{http::StatusCode, Json};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct PingRequest {
    #[serde(default)]
    pub transaction_id: Option<String>,
}

pub async fn ping(Json(req): Json<PingRequest>) -> (StatusCode, Json<serde_json::Value>) {
    tracing::debug!(transaction_id = ?req.transaction_id, "appservice ping received");
    (StatusCode::OK, Json(json!({})))
}
