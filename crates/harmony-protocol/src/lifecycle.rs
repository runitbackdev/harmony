use matrix_sdk_ui::room_list_service::RoomListLoadingState;

use crate::{Rpc, harmony_export, internal_error::InternalError, rooms, spaces, sync};

/// One-shot warming for the authenticated bridge.
///
/// Ensures sync is running, blocks until the room-list service has loaded,
/// and primes the space hierarchy so subscriptions started after this
/// returns can resolve against populated state. Idempotent — second call
/// returns immediately if everything is already warm.
///
/// Intended to be awaited from a route loader at the authenticated layout
/// so the router shows its pending UI throughout startup.
#[harmony_export(domain = "lifecycle", action = "warm")]
pub async fn warm() -> Rpc<()> {
    warm_impl().await.into()
}

async fn warm_impl() -> Result<(), InternalError> {
    sync::ensure_started().await?;

    let room_list = rooms::ensure_room_list().await?;

    let mut loading = room_list.loading_state();
    loop {
        match loading.get() {
            RoomListLoadingState::Loaded { .. } => break,
            RoomListLoadingState::NotLoaded => {
                if loading.next().await.is_none() {
                    return Err(InternalError::Sync(
                        "Room list loading stream ended unexpectedly".into(),
                    ));
                }
            }
        }
    }

    let space_service = spaces::get_service().await?;
    let _ = space_service.space_filters().await;

    Ok(())
}
