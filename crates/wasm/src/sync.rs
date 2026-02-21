use crate::{client, errors::HarmonyError};
use futures_util::StreamExt;
use matrix_sdk_ui::sync_service::{State, SyncService};
use std::cell::RefCell;
use wasm_bindgen::JsValue;

thread_local! {
    static SYNC_SERVICE: RefCell<Option<SyncService>> = const { RefCell::new(None) };
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

    sync_service.start().await;

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
