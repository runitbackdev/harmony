use std::cell::RefCell;
use std::sync::Arc;

use futures_util::StreamExt;
use harmony_protocol::{Command, Subscription, harmony_export};
use matrix_sdk_ui::room_list_service::RoomListService;
use matrix_sdk_ui::sync_service::{State, SyncService};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::JsValue;

use crate::{client, errors::HarmonyError};

thread_local! {
    static SYNC_SERVICE: RefCell<Option<SyncService>> = const { RefCell::new(None) };
    static ROOM_LIST_SERVICE: RefCell<Option<Arc<RoomListService>>> = const { RefCell::new(None) };
}

pub fn get_room_list_service() -> Option<Arc<RoomListService>> {
    ROOM_LIST_SERVICE.with(|rls| rls.borrow().clone())
}

/// Idempotent sync startup. First call builds + starts the `SyncService` and
/// caches the `RoomListService` in a thread-local for cross-module reuse.
/// Subsequent calls are no-ops. Callers needing the status stream should
/// invoke `sync.start` (which delegates here, then opens a stream).
pub async fn ensure_started() -> Result<(), HarmonyError> {
    if SYNC_SERVICE.with(|s| s.borrow().is_some()) {
        return Ok(());
    }

    let client = client::get().ok_or(HarmonyError::AuthFailed)?;
    let sync_service = SyncService::builder(client)
        .with_offline_mode()
        .build()
        .await
        .map_err(|err| HarmonyError::Sync(err.to_string()))?;

    let room_list_service = sync_service.room_list_service();
    sync_service.start().await;

    ROOM_LIST_SERVICE.with(|rls| *rls.borrow_mut() = Some(room_list_service));
    SYNC_SERVICE.with(|sync| *sync.borrow_mut() = Some(sync_service));

    Ok(())
}

#[derive(Tsify, Serialize, Deserialize, Clone, Copy, Debug)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Syncing,
    Stopped,
    Reconnecting,
    Error,
}

const fn map_state(state: &State) -> SyncStatus {
    match state {
        State::Running => SyncStatus::Syncing,
        State::Error(_) => SyncStatus::Error,
        State::Terminated | State::Idle => SyncStatus::Stopped,
        State::Offline => SyncStatus::Reconnecting,
    }
}

#[harmony_export(domain = "sync", action = "start")]
pub async fn start_sync() -> Subscription<(), SyncStatus> {
    start_sync_impl().await.into()
}

async fn start_sync_impl() -> Result<((), web_sys::ReadableStream), HarmonyError> {
    ensure_started().await?;

    let mut subscriber = SYNC_SERVICE
        .with(|s| s.borrow().as_ref().map(SyncService::state))
        .ok_or(HarmonyError::Sync("sync not started".into()))?;

    subscriber.reset();

    let stream = wasm_streams::ReadableStream::from_stream(subscriber.map(|state| {
        serde_wasm_bindgen::to_value(&map_state(&state))
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }));

    Ok(((), stream.into_raw()))
}

#[harmony_export(domain = "sync", action = "stop")]
pub async fn stop_sync() -> Command {
    stop_sync_impl().await.into()
}

async fn stop_sync_impl() -> Result<(), HarmonyError> {
    let Some(service) = SYNC_SERVICE.with(|sync| sync.borrow_mut().take()) else {
        return Ok(());
    };

    service.stop().await;

    Ok(())
}
