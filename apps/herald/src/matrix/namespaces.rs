use axum::{
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub async fn room(Path(alias): Path<String>) -> Response {
    not_found("room", &alias)
}

pub async fn user(Path(user_id): Path<String>) -> Response {
    not_found("user", &user_id)
}

fn not_found(kind: &str, id: &str) -> Response {
    tracing::debug!(kind, id, "namespace query: not owned by herald");
    (
        StatusCode::NOT_FOUND,
        Json(json!({
            "errcode": "M_NOT_FOUND",
            "error": format!("{kind} not provisioned by appservice"),
        })),
    )
        .into_response()
}
