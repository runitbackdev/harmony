use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use moka::future::Cache;
use ruma::{RoomId, UserId};
use serde::Deserialize;

use crate::matrix::MatrixClient;
use crate::state::AppState;

#[derive(Clone)]
pub struct TransactionCache {
    cache: Cache<String, ()>,
}

impl TransactionCache {
    pub fn new(ttl: Duration, max_capacity: u64) -> Self {
        let cache = Cache::builder()
            .max_capacity(max_capacity)
            .time_to_live(ttl)
            .build();
        Self { cache }
    }

    fn contains(&self, txn_id: &str) -> bool {
        self.cache.contains_key(txn_id)
    }

    async fn mark(&self, txn_id: String) {
        self.cache.insert(txn_id, ()).await;
    }
}

#[derive(Debug, Deserialize)]
pub struct Transaction {
    pub events: Vec<serde_json::Value>,
}

pub async fn update(
    Path(txn_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<Transaction>,
) -> Result<StatusCode, StatusCode> {
    if state.transactions.contains(&txn_id) {
        return Ok(StatusCode::OK);
    }

    for event in &payload.events {
        process_event(&state.matrix, event).await;
    }

    state.transactions.mark(txn_id).await;
    Ok(StatusCode::OK)
}

async fn process_event(matrix: &MatrixClient, event: &serde_json::Value) {
    let event_type = event["type"].as_str().unwrap_or_default();
    if event_type == "m.space.child" {
        handle_space_child(matrix, event).await;
    }
}

async fn handle_space_child(matrix: &MatrixClient, event: &serde_json::Value) {
    let Some(space_str) = event["room_id"].as_str() else {
        tracing::warn!(?event, "m.space.child missing room_id");
        return;
    };
    let Some(child_str) = event["state_key"].as_str() else {
        tracing::warn!(?event, "m.space.child missing state_key");
        return;
    };
    let Some(sender_str) = event["sender"].as_str() else {
        tracing::warn!(?event, "m.space.child missing sender");
        return;
    };

    let via_empty = event["content"]["via"].as_array().is_none_or(Vec::is_empty);
    if via_empty {
        return;
    }

    let space_id = match RoomId::parse(space_str) {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!(error = %e, room_id = %space_str, "invalid space room_id");
            return;
        }
    };
    let child_id = match RoomId::parse(child_str) {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!(error = %e, state_key = %child_str, "invalid child room_id");
            return;
        }
    };
    let sender_id = match UserId::parse(sender_str) {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!(error = %e, sender = %sender_str, "invalid sender user_id");
            return;
        }
    };

    let members = match matrix.joined_members(&space_id).await {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!(error = %e, space = %space_id, "joined_members failed");
            return;
        }
    };

    for member in members {
        if member == sender_id {
            continue;
        }
        if let Err(e) = matrix.join_room(&child_id, &member).await {
            tracing::warn!(error = %e, user = %member, child = %child_id, "auto-join failed");
        }
    }
}
