use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::state::AppState;

mod invites;
pub mod rate_limit;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/invites",
            post(invites::create).route_layer(rate_limit::strict()),
        )
        .route(
            "/invites/{code}",
            get(invites::show)
                .route_layer(rate_limit::relaxed())
                .merge(delete(invites::destroy).route_layer(rate_limit::strict())),
        )
        .route(
            "/invites/{code}/redemption",
            post(invites::redeem).route_layer(rate_limit::tight()),
        )
}
