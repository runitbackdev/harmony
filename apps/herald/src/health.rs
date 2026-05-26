use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use toasty::Db;

pub async fn check(State(db): State<Db>) -> impl IntoResponse {
    match db.connection().await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ok" }))).into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "health check db ping failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "degraded", "error": "database unreachable" })),
            )
                .into_response()
        }
    }
}
