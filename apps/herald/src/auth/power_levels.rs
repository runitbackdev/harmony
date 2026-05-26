use axum::http::StatusCode;
use ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use ruma::{RoomId, UserId};

use crate::matrix::MatrixClient;

/// Interim invite-permission gate sourced from `m.room.power_levels`.
///
/// Returns Ok(()) when `user`'s PL meets the room's `invite` threshold.
/// Returns 403 when below threshold, 502 when Matrix lookup fails.
///
/// Swap point for Harmony native roles (harmony-9nh). Keep the public
/// signature stable so the call sites don't change when the source
/// flips from Matrix PLs to Harmony role lookups.
pub async fn ensure_can_invite(
    matrix: &MatrixClient,
    room: &RoomId,
    user: &UserId,
) -> Result<(), StatusCode> {
    let pl = matrix.power_levels(room, user).await.map_err(|e| {
        tracing::warn!(error = %e, room = %room, "power_levels lookup failed");
        StatusCode::BAD_GATEWAY
    })?;

    if can_invite(&pl, user) {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

fn can_invite(pl: &RoomPowerLevelsEventContent, user: &UserId) -> bool {
    let user_pl = pl.users.get(user).copied().unwrap_or(pl.users_default);
    user_pl >= pl.invite
}
