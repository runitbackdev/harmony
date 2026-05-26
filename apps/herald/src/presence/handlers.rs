use std::time::Duration;

use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};

use crate::presence::connection::{Connection, Deps};
use crate::state::AppState;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    let deps = Deps {
        tokens: state.tokens,
        registry: state.presence_registry,
        fanout: state.presence_fanout,
        subscriptions: state.subscriptions,
        membership: state.membership,
        identify_timeout: Duration::from_secs(state.config.presence_identify_timeout_secs),
        max_spaces_per_subscribe: state.config.presence_max_spaces_per_subscribe,
        max_subscriptions_per_conn: state.config.presence_max_subscriptions_per_conn,
        auto_idle: Duration::from_secs(state.config.presence_auto_idle_secs),
        shutdown: state.shutdown,
    };
    ws.on_upgrade(move |socket| handle_socket(socket, deps))
}

async fn handle_socket(socket: WebSocket, deps: Deps) {
    Connection::run(socket, deps).await;
}
