use crate::{client, errors::HarmonyError};
use futures_util::StreamExt;
use matrix_sdk_ui::room_list_service::RoomListService;
use matrix_sdk_ui::sync_service::{State, SyncService};
use std::cell::RefCell;
use std::sync::Arc;
use wasm_bindgen::JsValue;

thread_local! {
    static SYNC_SERVICE: RefCell<Option<SyncService>> = const { RefCell::new(None) };
    static ROOM_LIST_SERVICE: RefCell<Option<Arc<RoomListService>>> = const { RefCell::new(None) };
}

pub fn get_room_list_service() -> Option<Arc<RoomListService>> {
    ROOM_LIST_SERVICE.with(|rls| rls.borrow().clone())
}

const fn map_state(state: &State) -> &'static str {
    match state {
        State::Running => "syncing",
        State::Error(_) => "error",
        State::Terminated | State::Idle => "stopped",
        State::Offline => "reconnecting",
    }
}

pub async fn start_sync_impl() -> Result<web_sys::ReadableStream, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::AuthFailed)?;

    let sync_service = SyncService::builder(client)
        .build()
        .await
        .map_err(|err| HarmonyError::Sync(err.to_string()))?;

    let status = sync_service.state();

    let room_list_service = sync_service.room_list_service();
    sync_service.start().await;

    ROOM_LIST_SERVICE.with(|rls| *rls.borrow_mut() = Some(room_list_service));
    SYNC_SERVICE.with(|sync| *sync.borrow_mut() = Some(sync_service));

    let stream = wasm_streams::ReadableStream::from_stream(
        status.map(|state| Ok(JsValue::from_str(map_state(&state)))),
    );

    Ok(stream.into_raw())
}

pub async fn stop_sync_impl() -> Result<(), HarmonyError> {
    let Some(service) = SYNC_SERVICE.with(|sync| sync.borrow_mut().take()) else {
        return Ok(());
    };

    service.stop().await;

    Ok(())
}
