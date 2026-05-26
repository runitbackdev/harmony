use axum::{
    routing::{get, post, put},
    Router,
};

use crate::state::AppState;

pub mod api;
pub mod client;
mod namespaces;
mod pings;
mod transactions;

pub use api::MatrixApi;
pub use client::{AuthError, Identity, MatrixClient, MatrixError};
pub use transactions::TransactionCache;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/transactions/{txn_id}", put(transactions::update))
        .route("/ping", post(pings::ping))
        .route("/rooms/{alias}", get(namespaces::room))
        .route("/users/{user_id}", get(namespaces::user))
}
