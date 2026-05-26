use std::sync::Arc;

use axum::{routing::get, Router};

use crate::state::AppState;

mod connection;
pub mod custom_status;
pub mod fanout;
mod handlers;
pub mod protocol;
pub mod rate_limit;
pub mod registry;
pub mod subscriptions;

#[allow(dead_code)]
#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct ConnId(Arc<str>);

#[allow(dead_code)]
impl ConnId {
    pub fn new(value: impl Into<Arc<str>>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/v1", get(handlers::ws_handler))
}
