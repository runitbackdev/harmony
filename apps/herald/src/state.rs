use std::sync::Arc;

use axum::extract::FromRef;
use toasty::Db;
use tokio_util::sync::CancellationToken;

use crate::auth::TokenCache;
use crate::config::Config;
use crate::matrix::{MatrixClient, TransactionCache};
use crate::membership::MembershipCache;
use crate::presence::fanout::PresenceFanout;
use crate::presence::registry::PresenceRegistry;
use crate::presence::subscriptions::SubscriptionRegistry;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub matrix: MatrixClient,
    pub config: Config,
    pub tokens: TokenCache,
    pub transactions: TransactionCache,
    pub membership: MembershipCache,
    pub subscriptions: Arc<SubscriptionRegistry>,
    pub presence_fanout: Arc<PresenceFanout>,
    pub presence_registry: Arc<PresenceRegistry>,
    /// App-wide cancellation token. Fires on SIGTERM/SIGINT. WS conns select
    /// on it so they emit `Close(1012 SERVICE_RESTART)` before draining.
    pub shutdown: CancellationToken,
}

impl FromRef<AppState> for Db {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}

impl FromRef<AppState> for MatrixClient {
    fn from_ref(state: &AppState) -> Self {
        state.matrix.clone()
    }
}

impl FromRef<AppState> for Config {
    fn from_ref(state: &AppState) -> Self {
        state.config.clone()
    }
}

impl FromRef<AppState> for TokenCache {
    fn from_ref(state: &AppState) -> Self {
        state.tokens.clone()
    }
}

impl FromRef<AppState> for TransactionCache {
    fn from_ref(state: &AppState) -> Self {
        state.transactions.clone()
    }
}

impl FromRef<AppState> for MembershipCache {
    fn from_ref(state: &AppState) -> Self {
        state.membership.clone()
    }
}

impl FromRef<AppState> for Arc<SubscriptionRegistry> {
    fn from_ref(state: &AppState) -> Self {
        state.subscriptions.clone()
    }
}

impl FromRef<AppState> for Arc<PresenceFanout> {
    fn from_ref(state: &AppState) -> Self {
        state.presence_fanout.clone()
    }
}

impl FromRef<AppState> for Arc<PresenceRegistry> {
    fn from_ref(state: &AppState) -> Self {
        state.presence_registry.clone()
    }
}
