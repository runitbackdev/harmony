use std::sync::Arc;

use futures_util::{Stream, StreamExt};
use matrix_sdk_common::SendOutsideWasm;
use matrix_sdk_ui::room_list_service::RoomListService;
use matrix_sdk_ui::sync_service::{State, SyncService};

use crate::{
    Command, Shared, Subscription, client, harmony, harmony_export, internal_error::InternalError,
};

static SYNC_SERVICE: Shared<Option<SyncService>> = Shared::new();
static ROOM_LIST_SERVICE: Shared<Option<Arc<RoomListService>>> = Shared::new();

pub fn get_room_list_service() -> Option<Arc<RoomListService>> {
    ROOM_LIST_SERVICE.with(|opt| opt.clone())
}

/// Idempotent sync startup. First call builds + starts the `SyncService`,
/// caches the `RoomListService` for cross-module reuse. Subsequent calls
/// are no-ops.
pub async fn ensure_started() -> Result<(), InternalError> {
    if SYNC_SERVICE.with(|opt| opt.is_some()) {
        return Ok(());
    }

    let client = client::get().ok_or(InternalError::AuthFailed)?;

    // matrix-sdk-ui timelines read from the client EventCache. Without this
    // subscription, sync responses never reach the cache and only send-queue
    // local echoes surface — other people's messages stay invisible. Must run
    // before sync starts so no responses are missed; idempotent and cheap.
    client
        .event_cache()
        .subscribe()
        .map_err(|err| InternalError::Sync(err.to_string()))?;

    let sync_service = SyncService::builder(client)
        .with_offline_mode()
        .build()
        .await
        .map_err(|err| InternalError::Sync(err.to_string()))?;

    let room_list_service = sync_service.room_list_service();
    sync_service.start().await;

    ROOM_LIST_SERVICE.with(|opt| *opt = Some(room_list_service));
    SYNC_SERVICE.with(|opt| *opt = Some(sync_service));

    Ok(())
}

#[harmony]
#[derive(Clone, Copy, Debug)]
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

async fn start_sync_impl()
-> Result<((), impl Stream<Item = SyncStatus> + SendOutsideWasm), InternalError> {
    ensure_started().await?;

    let mut subscriber = SYNC_SERVICE
        .with(|opt| opt.as_ref().map(SyncService::state))
        .ok_or(InternalError::Sync("sync not started".into()))?;

    subscriber.reset();

    let stream = subscriber.map(|state| map_state(&state));
    Ok(((), stream))
}

#[harmony_export(domain = "sync", action = "stop")]
pub async fn stop_sync() -> Command {
    stop_sync_impl().await.into()
}

async fn stop_sync_impl() -> Result<(), InternalError> {
    let service = SYNC_SERVICE.with(std::option::Option::take);
    let Some(service) = service else {
        return Ok(());
    };
    service.stop().await;
    Ok(())
}
