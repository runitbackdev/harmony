//! Custom status (Discord type=4 activity) data + DB persistence helpers.
//!
//! Lifecycle and in-memory cache live on `PresenceRegistry`. This module is
//! the value type + DB glue.

use jiff::Timestamp;
use ruma::UserId;
use toasty::Db;

use crate::models::custom_status::CustomStatus;
use crate::presence::protocol::{Activity, ActivityEmoji, ActivityKind};

/// In-memory representation of a user's custom status. Lives in the
/// registry's custom-status cache; survives across reconnects and is
/// persisted to Postgres on set/clear.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomStatusData {
    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,
    pub emoji_animated: bool,
    pub text: Option<String>,
    pub expires_at: Option<Timestamp>,
}

impl CustomStatusData {
    /// Extract a `CustomStatusData` from an inbound `ActivityKind::Custom`
    /// activity. Caller is responsible for ensuring `kind == Custom`.
    pub fn from_activity(activity: &Activity) -> Self {
        let (emoji_name, emoji_id, emoji_animated) =
            activity.emoji.as_ref().map_or((None, None, false), |e| {
                (Some(e.name.clone()), e.id.clone(), e.animated)
            });
        Self {
            emoji_name,
            emoji_id,
            emoji_animated,
            text: Some(activity.name.clone()).filter(|s| !s.is_empty()),
            expires_at: activity.expires_at,
        }
    }

    /// Realize the in-memory state as a synthetic outbound `Activity`. Used
    /// when merging custom status into a user's effective presence on
    /// fanout. Returns `None` if expired against `now`.
    pub fn to_activity(&self, now: Timestamp) -> Option<Activity> {
        if let Some(deadline) = self.expires_at {
            if deadline <= now {
                return None;
            }
        }

        let emoji = self.emoji_name.as_ref().map(|name| ActivityEmoji {
            name: name.clone(),
            id: self.emoji_id.clone(),
            animated: self.emoji_animated,
        });

        Some(Activity {
            name: self.text.clone().unwrap_or_default(),
            kind: ActivityKind::Custom,
            url: None,
            created_at: None,
            expires_at: self.expires_at,
            timestamps: None,
            application_id: None,
            details: None,
            state: None,
            emoji,
            party: None,
            assets: None,
            secrets: None,
            instance: None,
            flags: 0,
            buttons: Vec::new(),
        })
    }

    fn from_row(row: &CustomStatus) -> Self {
        Self {
            emoji_name: row.emoji_name.clone(),
            emoji_id: row.emoji_id.clone(),
            emoji_animated: row.emoji_animated,
            text: row.text.clone(),
            expires_at: row.expires_at,
        }
    }
}

/// Errors surfaced from the DB layer. Persistence failures are non-fatal
/// for the WS path — the in-memory cache stays authoritative until restart.
#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("toasty error: {0}")]
    Toasty(String),
}

impl From<toasty::Error> for PersistenceError {
    fn from(value: toasty::Error) -> Self {
        Self::Toasty(value.to_string())
    }
}

/// Load a user's custom status from Postgres, if any.
pub async fn load(
    db: &mut Db,
    user_id: &UserId,
) -> Result<Option<CustomStatusData>, PersistenceError> {
    let mxid = user_id.as_str();
    Ok(CustomStatus::get_by_mxid(db, mxid)
        .await
        .ok()
        .map(|row| CustomStatusData::from_row(&row)))
}

/// Insert or update the user's custom-status row. Upsert is fetch-then-
/// branch: toasty doesn't expose ON CONFLICT directly, and concurrent
/// writes for the same mxid are serialized through the WS handler.
pub async fn upsert(
    db: &mut Db,
    user_id: &UserId,
    data: &CustomStatusData,
) -> Result<(), PersistenceError> {
    let mxid = user_id.as_str();
    match CustomStatus::get_by_mxid(db, mxid).await {
        Ok(mut existing) => {
            existing
                .update()
                .emoji_name(data.emoji_name.clone())
                .emoji_id(data.emoji_id.clone())
                .emoji_animated(data.emoji_animated)
                .text(data.text.clone())
                .expires_at(data.expires_at)
                .exec(db)
                .await?;
        }
        Err(_) => {
            toasty::create!(CustomStatus {
                mxid: mxid.to_string(),
                emoji_name: data.emoji_name.clone(),
                emoji_id: data.emoji_id.clone(),
                emoji_animated: data.emoji_animated,
                text: data.text.clone(),
                expires_at: data.expires_at,
            })
            .exec(db)
            .await?;
        }
    }
    Ok(())
}

/// Delete the user's custom-status row. Idempotent — missing row is OK.
pub async fn delete(db: &mut Db, user_id: &UserId) -> Result<(), PersistenceError> {
    let mxid = user_id.as_str();
    if let Ok(row) = CustomStatus::get_by_mxid(db, mxid).await {
        row.delete().exec(db).await?;
    }
    Ok(())
}
