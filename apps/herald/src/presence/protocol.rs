#![allow(dead_code)]

use jiff::Timestamp;
use ruma::{OwnedRoomId, OwnedUserId};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use crate::matrix::AuthError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Online,
    Idle,
    Dnd,
    Invisible,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientType {
    Desktop,
    Mobile,
    Web,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientStatus {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desktop: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mobile: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web: Option<Status>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum ActivityKind {
    Playing = 0,
    Streaming = 1,
    Listening = 2,
    Watching = 3,
    Custom = 4,
    Competing = 5,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Activity {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: ActivityKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<Timestamp>,
    /// Server-enforced expiry. Only meaningful for `ActivityKind::Custom`;
    /// ignored on inbound for other kinds. On outbound, the registry omits
    /// the activity once `expires_at < now`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<Timestamp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamps: Option<ActivityTimestamps>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub application_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji: Option<ActivityEmoji>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub party: Option<ActivityParty>,
    // Inbound stripped (asset pipeline deferred — harmony-t16.11).
    // Outbound kept for forward-compat once assets ship.
    #[serde(default, skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub assets: Option<ActivityAssets>,
    // Inbound stripped — invite-to-join feature post-MVP.
    #[serde(default, skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<ActivitySecrets>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance: Option<bool>,
    #[serde(default)]
    pub flags: i32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub buttons: Vec<ActivityButton>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityTimestamps {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<Timestamp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<Timestamp>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityEmoji {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default)]
    pub animated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityParty {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<[u32; 2]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityAssets {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub large_image: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub large_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub small_image: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub small_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivitySecrets {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub join: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spectate: Option<String>,
    #[serde(default, rename = "match", skip_serializing_if = "Option::is_none")]
    pub match_: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityButton {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Presence {
    pub status: Status,
    #[serde(default)]
    pub activities: Vec<Activity>,
    #[serde(default)]
    pub afk: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since: Option<Timestamp>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UserPresence {
    pub user_id: OwnedUserId,
    pub status: Status,
    pub client_status: ClientStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub activities: Vec<Activity>,
}

pub type PresenceUpdateEvent = UserPresence;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "op", content = "d", rename_all = "snake_case")]
pub enum ClientFrame {
    Identify(IdentifyPayload),
    Heartbeat,
    UpdatePresence(Presence),
    ClientIdle(ClientIdlePayload),
    Subscribe(SubscribePayload),
    Unsubscribe(UnsubscribePayload),
}

#[derive(Debug, Clone, Deserialize)]
pub struct IdentifyPayload {
    pub token: String,
    #[serde(default)]
    pub client_type: Option<ClientType>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientIdlePayload {
    pub idle: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SubscribePayload {
    pub space_ids: Vec<OwnedRoomId>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UnsubscribePayload {
    pub space_ids: Vec<OwnedRoomId>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "op", content = "d", rename_all = "snake_case")]
pub enum ServerFrame {
    Hello(HelloPayload),
    Dispatch(Dispatch),
    HeartbeatAck,
    Reconnect,
    InvalidSession,
    Error(WsErrorPayload),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    RateLimited,
}

#[derive(Debug, Clone, Serialize)]
pub struct WsErrorPayload {
    pub code: ErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HelloPayload {
    pub heartbeat_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "t", content = "d", rename_all = "snake_case")]
pub enum Dispatch {
    Ready(ReadyPayload),
    PresenceUpdate(PresenceUpdateEvent),
    Subscribed(SubscribedPayload),
    Unsubscribed(UnsubscribedPayload),
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadyPayload {
    pub user_id: OwnedUserId,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubscribedPayload {
    pub accepted: Vec<OwnedRoomId>,
    pub rejected: Vec<RejectedSpace>,
    pub snapshots: Vec<UserPresence>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnsubscribedPayload {
    pub space_ids: Vec<OwnedRoomId>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RejectedSpace {
    pub space_id: OwnedRoomId,
    pub reason: SubscribeRejectReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscribeRejectReason {
    Forbidden,
    TemporarilyUnavailable,
    LimitExceeded,
}

pub const ACTIVITY_NAME_MAX: usize = 128;
pub const ACTIVITY_TEXT_MAX: usize = 128;
pub const ACTIVITY_URL_MAX: usize = 512;
pub const EMOJI_NAME_MAX: usize = 32;
pub const EMOJI_ID_MAX: usize = 128;
pub const APPLICATION_ID_MAX: usize = 64;
pub const PARTY_ID_MAX: usize = 64;
pub const PARTY_SIZE_MAX: u32 = 1000;
pub const BUTTONS_MAX: usize = 2;
pub const BUTTON_LABEL_MAX: usize = 32;
pub const BUTTON_URL_MAX: usize = 512;
pub const ACTIVITIES_PER_PRESENCE_MAX: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    TooManyActivities { len: usize },
    NameEmpty,
    NameTooLong { len: usize },
    DetailsTooLong { len: usize },
    StateTooLong { len: usize },
    ContainsHtml { field: &'static str },
    TooManyButtons { len: usize },
    ButtonLabelEmpty,
    ButtonLabelTooLong { len: usize },
    ButtonUrlTooLong { len: usize },
    EmojiNameEmpty,
    EmojiNameTooLong { len: usize },
    EmojiIdTooLong { len: usize },
    EmojiAnimatedWithoutId,
    ApplicationIdTooLong { len: usize },
    PartyIdTooLong { len: usize },
    PartySizeInvalid,
    ActivityUrlOnNonStreaming,
    ActivityUrlTooLong { len: usize },
    TimestampsReversed,
    FlagsNegative,
    MultipleCustomActivities,
}

fn contains_html(s: &str) -> bool {
    s.contains('<') || s.contains('>')
}

impl ActivityEmoji {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.name.is_empty() {
            return Err(ValidationError::EmojiNameEmpty);
        }
        let name_len = self.name.chars().count();
        if name_len > EMOJI_NAME_MAX {
            return Err(ValidationError::EmojiNameTooLong { len: name_len });
        }
        if contains_html(&self.name) {
            return Err(ValidationError::ContainsHtml {
                field: "emoji.name",
            });
        }
        if let Some(id) = &self.id {
            let id_len = id.chars().count();
            if id_len > EMOJI_ID_MAX {
                return Err(ValidationError::EmojiIdTooLong { len: id_len });
            }
        } else if self.animated {
            return Err(ValidationError::EmojiAnimatedWithoutId);
        }
        Ok(())
    }
}

impl ActivityParty {
    fn validate(&self) -> Result<(), ValidationError> {
        if let Some(id) = &self.id {
            let id_len = id.chars().count();
            if id_len > PARTY_ID_MAX {
                return Err(ValidationError::PartyIdTooLong { len: id_len });
            }
        }
        if let Some([current, max]) = self.size {
            if max == 0 || max > PARTY_SIZE_MAX || current > max {
                return Err(ValidationError::PartySizeInvalid);
            }
        }
        Ok(())
    }
}

impl ActivityButton {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.label.is_empty() {
            return Err(ValidationError::ButtonLabelEmpty);
        }
        let label_len = self.label.chars().count();
        if label_len > BUTTON_LABEL_MAX {
            return Err(ValidationError::ButtonLabelTooLong { len: label_len });
        }
        if contains_html(&self.label) {
            return Err(ValidationError::ContainsHtml {
                field: "button.label",
            });
        }
        let url_len = self.url.chars().count();
        if url_len > BUTTON_URL_MAX {
            return Err(ValidationError::ButtonUrlTooLong { len: url_len });
        }
        Ok(())
    }
}

impl ActivityTimestamps {
    fn validate(&self) -> Result<(), ValidationError> {
        if let (Some(start), Some(end)) = (self.start, self.end) {
            if start > end {
                return Err(ValidationError::TimestampsReversed);
            }
        }
        Ok(())
    }
}

impl Activity {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.name.is_empty() {
            return Err(ValidationError::NameEmpty);
        }
        let name_len = self.name.chars().count();
        if name_len > ACTIVITY_NAME_MAX {
            return Err(ValidationError::NameTooLong { len: name_len });
        }
        if contains_html(&self.name) {
            return Err(ValidationError::ContainsHtml { field: "name" });
        }

        if let Some(details) = &self.details {
            let len = details.chars().count();
            if len > ACTIVITY_TEXT_MAX {
                return Err(ValidationError::DetailsTooLong { len });
            }
            if contains_html(details) {
                return Err(ValidationError::ContainsHtml { field: "details" });
            }
        }

        if let Some(state) = &self.state {
            let len = state.chars().count();
            if len > ACTIVITY_TEXT_MAX {
                return Err(ValidationError::StateTooLong { len });
            }
            if contains_html(state) {
                return Err(ValidationError::ContainsHtml { field: "state" });
            }
        }

        match (&self.url, self.kind) {
            (Some(url), ActivityKind::Streaming) => {
                let len = url.chars().count();
                if len > ACTIVITY_URL_MAX {
                    return Err(ValidationError::ActivityUrlTooLong { len });
                }
            }
            (Some(_), _) => return Err(ValidationError::ActivityUrlOnNonStreaming),
            (None, _) => {}
        }

        if let Some(app_id) = &self.application_id {
            let len = app_id.chars().count();
            if len > APPLICATION_ID_MAX {
                return Err(ValidationError::ApplicationIdTooLong { len });
            }
        }

        if let Some(emoji) = &self.emoji {
            emoji.validate()?;
        }
        if let Some(party) = &self.party {
            party.validate()?;
        }
        if let Some(ts) = &self.timestamps {
            ts.validate()?;
        }

        if self.buttons.len() > BUTTONS_MAX {
            return Err(ValidationError::TooManyButtons {
                len: self.buttons.len(),
            });
        }
        for button in &self.buttons {
            button.validate()?;
        }

        if self.flags < 0 {
            return Err(ValidationError::FlagsNegative);
        }

        Ok(())
    }
}

impl Presence {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.activities.len() > ACTIVITIES_PER_PRESENCE_MAX {
            return Err(ValidationError::TooManyActivities {
                len: self.activities.len(),
            });
        }
        let mut custom_count = 0_usize;
        for activity in &self.activities {
            activity.validate()?;
            if activity.kind == ActivityKind::Custom {
                custom_count += 1;
            }
        }
        if custom_count > 1 {
            return Err(ValidationError::MultipleCustomActivities);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseCode {
    Internal,
    DecodeError,
    AuthTimeout,
    AuthFailed,
    AlreadyAuthed,
    Forbidden,
    AuthRequired,
    RateLimited {
        retry_after_ms: u64,
    },
    HeartbeatTimeout,
    Upstream,
    PayloadTooLarge,
    /// 1012 `SERVICE_RESTART` — server shutting down; client should reconnect.
    Shutdown,
}

impl CloseCode {
    pub fn wire(self) -> (u16, std::borrow::Cow<'static, str>) {
        match self {
            Self::Internal => (4000, "internal error".into()),
            Self::DecodeError => (4002, "decode error".into()),
            Self::AuthTimeout => (4003, "identify timeout".into()),
            Self::AuthFailed => (4004, "authentication failed".into()),
            Self::AlreadyAuthed => (4005, "already authenticated".into()),
            Self::Forbidden => (4006, "forbidden".into()),
            Self::AuthRequired => (4007, "identify required as first frame".into()),
            Self::RateLimited { retry_after_ms } => (
                4008,
                format!("rate limited; retry_after_ms={retry_after_ms}").into(),
            ),
            Self::HeartbeatTimeout => (4009, "heartbeat timeout".into()),
            Self::Upstream => (4010, "homeserver unavailable".into()),
            Self::PayloadTooLarge => (4011, "payload too large".into()),
            Self::Shutdown => (1012, "service restart".into()),
        }
    }
}

impl From<AuthError> for CloseCode {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::Invalid => Self::AuthFailed,
            AuthError::Forbidden => Self::Forbidden,
            AuthError::RateLimited(ms) => Self::RateLimited { retry_after_ms: ms },
            AuthError::Upstream => Self::Upstream,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_error_maps_to_close_code() {
        assert_eq!(CloseCode::from(AuthError::Invalid), CloseCode::AuthFailed);
        assert_eq!(CloseCode::from(AuthError::Forbidden), CloseCode::Forbidden);
        assert_eq!(
            CloseCode::from(AuthError::RateLimited(1500)),
            CloseCode::RateLimited {
                retry_after_ms: 1500
            }
        );
        assert_eq!(CloseCode::from(AuthError::Upstream), CloseCode::Upstream);
    }

    #[test]
    fn wire_codes_are_stable() {
        let cases = [
            (CloseCode::Internal, 4000),
            (CloseCode::DecodeError, 4002),
            (CloseCode::AuthTimeout, 4003),
            (CloseCode::AuthFailed, 4004),
            (CloseCode::AlreadyAuthed, 4005),
            (CloseCode::Forbidden, 4006),
            (CloseCode::AuthRequired, 4007),
            (CloseCode::RateLimited { retry_after_ms: 0 }, 4008),
            (CloseCode::HeartbeatTimeout, 4009),
            (CloseCode::Upstream, 4010),
            (CloseCode::PayloadTooLarge, 4011),
            (CloseCode::Shutdown, 1012),
        ];
        for (code, expected) in cases {
            assert_eq!(code.wire().0, expected, "code {code:?}");
        }
    }

    #[test]
    fn rate_limited_reason_embeds_retry_after_ms() {
        let (_, reason) = CloseCode::RateLimited {
            retry_after_ms: 2500,
        }
        .wire();
        assert!(reason.contains("retry_after_ms=2500"), "reason: {reason}");
    }

    #[test]
    fn subscribe_frame_round_trips() {
        let raw = r#"{"op":"subscribe","d":{"space_ids":["!r1:test.org","!r2:test.org"]}}"#;
        let frame: ClientFrame = serde_json::from_str(raw).expect("parse");
        match frame {
            ClientFrame::Subscribe(p) => assert_eq!(p.space_ids.len(), 2),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn unsubscribe_frame_round_trips() {
        let raw = r#"{"op":"unsubscribe","d":{"space_ids":["!r1:test.org"]}}"#;
        let frame: ClientFrame = serde_json::from_str(raw).expect("parse");
        assert!(matches!(frame, ClientFrame::Unsubscribe(_)));
    }

    #[test]
    fn subscribed_dispatch_serializes_with_t_tag() {
        let frame = ServerFrame::Dispatch(Dispatch::Subscribed(SubscribedPayload {
            accepted: vec![],
            rejected: vec![],
            snapshots: vec![],
        }));
        let json = serde_json::to_string(&frame).expect("serialize");
        assert!(json.contains(r#""op":"dispatch""#), "{json}");
        assert!(json.contains(r#""t":"subscribed""#), "{json}");
    }

    #[test]
    fn unsubscribed_dispatch_serializes_with_t_tag() {
        let frame = ServerFrame::Dispatch(Dispatch::Unsubscribed(UnsubscribedPayload {
            space_ids: vec![],
        }));
        let json = serde_json::to_string(&frame).expect("serialize");
        assert!(json.contains(r#""t":"unsubscribed""#), "{json}");
    }

    fn base_activity() -> Activity {
        Activity {
            name: "Game".to_string(),
            kind: ActivityKind::Playing,
            url: None,
            created_at: None,
            expires_at: None,
            timestamps: None,
            application_id: None,
            details: None,
            state: None,
            emoji: None,
            party: None,
            assets: None,
            secrets: None,
            instance: None,
            flags: 0,
            buttons: Vec::new(),
        }
    }

    #[test]
    fn validate_minimal_activity_ok() {
        assert!(base_activity().validate().is_ok());
    }

    #[test]
    fn validate_rejects_empty_name() {
        let mut a = base_activity();
        a.name = String::new();
        assert_eq!(a.validate(), Err(ValidationError::NameEmpty));
    }

    #[test]
    fn validate_rejects_long_name() {
        let mut a = base_activity();
        a.name = "x".repeat(ACTIVITY_NAME_MAX + 1);
        assert!(matches!(
            a.validate(),
            Err(ValidationError::NameTooLong { .. })
        ));
    }

    #[test]
    fn validate_counts_chars_not_bytes() {
        let mut a = base_activity();
        // 128 Cyrillic chars = 256 bytes. Must pass chars-based check.
        a.name = "Б".repeat(ACTIVITY_NAME_MAX);
        assert!(a.validate().is_ok());
        a.name = "Б".repeat(ACTIVITY_NAME_MAX + 1);
        assert!(matches!(
            a.validate(),
            Err(ValidationError::NameTooLong { .. })
        ));
    }

    #[test]
    fn validate_rejects_html_in_text_fields() {
        let mut a = base_activity();
        a.name = "<script>".to_string();
        assert_eq!(
            a.validate(),
            Err(ValidationError::ContainsHtml { field: "name" })
        );

        a = base_activity();
        a.details = Some("plain > thing".to_string());
        assert_eq!(
            a.validate(),
            Err(ValidationError::ContainsHtml { field: "details" })
        );

        a = base_activity();
        a.state = Some("hi <".to_string());
        assert_eq!(
            a.validate(),
            Err(ValidationError::ContainsHtml { field: "state" })
        );
    }

    #[test]
    fn validate_allows_empty_optional_text() {
        let mut a = base_activity();
        a.details = Some(String::new());
        a.state = Some(String::new());
        assert!(a.validate().is_ok());
    }

    #[test]
    fn validate_streaming_url_length() {
        let mut a = base_activity();
        a.kind = ActivityKind::Streaming;
        a.url = Some("https://twitch.tv/x".to_string());
        assert!(a.validate().is_ok());

        a.url = Some("x".repeat(ACTIVITY_URL_MAX + 1));
        assert!(matches!(
            a.validate(),
            Err(ValidationError::ActivityUrlTooLong { .. })
        ));
    }

    #[test]
    fn validate_url_only_on_streaming() {
        let mut a = base_activity();
        a.url = Some("https://example.com".to_string());
        assert_eq!(
            a.validate(),
            Err(ValidationError::ActivityUrlOnNonStreaming)
        );
    }

    #[test]
    fn validate_buttons_count_cap() {
        let mut a = base_activity();
        a.buttons = vec![
            ActivityButton {
                label: "a".into(),
                url: "https://x".into(),
            };
            BUTTONS_MAX + 1
        ];
        assert!(matches!(
            a.validate(),
            Err(ValidationError::TooManyButtons { .. })
        ));
    }

    #[test]
    fn validate_button_label_empty() {
        let mut a = base_activity();
        a.buttons = vec![ActivityButton {
            label: String::new(),
            url: "https://x".into(),
        }];
        assert_eq!(a.validate(), Err(ValidationError::ButtonLabelEmpty));
    }

    #[test]
    fn validate_button_label_length() {
        let mut a = base_activity();
        a.buttons = vec![ActivityButton {
            label: "x".repeat(BUTTON_LABEL_MAX + 1),
            url: "https://x".into(),
        }];
        assert!(matches!(
            a.validate(),
            Err(ValidationError::ButtonLabelTooLong { .. })
        ));
    }

    #[test]
    fn validate_button_url_length() {
        let mut a = base_activity();
        a.buttons = vec![ActivityButton {
            label: "ok".into(),
            url: "x".repeat(BUTTON_URL_MAX + 1),
        }];
        assert!(matches!(
            a.validate(),
            Err(ValidationError::ButtonUrlTooLong { .. })
        ));
    }

    #[test]
    fn validate_emoji_name_empty() {
        let mut a = base_activity();
        a.emoji = Some(ActivityEmoji {
            name: String::new(),
            id: None,
            animated: false,
        });
        assert_eq!(a.validate(), Err(ValidationError::EmojiNameEmpty));
    }

    #[test]
    fn validate_emoji_name_length() {
        let mut a = base_activity();
        a.emoji = Some(ActivityEmoji {
            name: "x".repeat(EMOJI_NAME_MAX + 1),
            id: None,
            animated: false,
        });
        assert!(matches!(
            a.validate(),
            Err(ValidationError::EmojiNameTooLong { .. })
        ));
    }

    #[test]
    fn validate_emoji_animated_requires_id() {
        let mut a = base_activity();
        a.emoji = Some(ActivityEmoji {
            name: "blob".into(),
            id: None,
            animated: true,
        });
        assert_eq!(a.validate(), Err(ValidationError::EmojiAnimatedWithoutId));
    }

    #[test]
    fn validate_emoji_id_length() {
        let mut a = base_activity();
        a.emoji = Some(ActivityEmoji {
            name: "blob".into(),
            id: Some("x".repeat(EMOJI_ID_MAX + 1)),
            animated: false,
        });
        assert!(matches!(
            a.validate(),
            Err(ValidationError::EmojiIdTooLong { .. })
        ));
    }

    #[test]
    fn validate_party_size_bounds() {
        let mut a = base_activity();
        a.party = Some(ActivityParty {
            id: None,
            size: Some([1, 5]),
        });
        assert!(a.validate().is_ok());

        a.party = Some(ActivityParty {
            id: None,
            size: Some([6, 5]),
        });
        assert_eq!(a.validate(), Err(ValidationError::PartySizeInvalid));

        a.party = Some(ActivityParty {
            id: None,
            size: Some([0, 0]),
        });
        assert_eq!(a.validate(), Err(ValidationError::PartySizeInvalid));

        a.party = Some(ActivityParty {
            id: None,
            size: Some([1, PARTY_SIZE_MAX + 1]),
        });
        assert_eq!(a.validate(), Err(ValidationError::PartySizeInvalid));
    }

    #[test]
    fn validate_party_id_length() {
        let mut a = base_activity();
        a.party = Some(ActivityParty {
            id: Some("x".repeat(PARTY_ID_MAX + 1)),
            size: None,
        });
        assert!(matches!(
            a.validate(),
            Err(ValidationError::PartyIdTooLong { .. })
        ));
    }

    #[test]
    fn validate_application_id_length() {
        let mut a = base_activity();
        a.application_id = Some("x".repeat(APPLICATION_ID_MAX + 1));
        assert!(matches!(
            a.validate(),
            Err(ValidationError::ApplicationIdTooLong { .. })
        ));
    }

    #[test]
    fn validate_timestamps_reversed() {
        let mut a = base_activity();
        let start: Timestamp = "2025-01-02T00:00:00Z".parse().expect("parse start");
        let end: Timestamp = "2025-01-01T00:00:00Z".parse().expect("parse end");
        a.timestamps = Some(ActivityTimestamps {
            start: Some(start),
            end: Some(end),
        });
        assert_eq!(a.validate(), Err(ValidationError::TimestampsReversed));
    }

    #[test]
    fn validate_flags_negative_rejected() {
        let mut a = base_activity();
        a.flags = -1;
        assert_eq!(a.validate(), Err(ValidationError::FlagsNegative));
    }

    #[test]
    fn presence_caps_activities() {
        let p = Presence {
            status: Status::Online,
            activities: vec![base_activity(); ACTIVITIES_PER_PRESENCE_MAX + 1],
            afk: false,
            since: None,
        };
        assert!(matches!(
            p.validate(),
            Err(ValidationError::TooManyActivities { .. })
        ));
    }

    #[test]
    fn presence_empty_activities_ok() {
        let p = Presence {
            status: Status::Online,
            activities: Vec::new(),
            afk: false,
            since: None,
        };
        assert!(p.validate().is_ok());
    }

    #[test]
    fn assets_stripped_on_deserialize() {
        let raw = r#"{
            "name": "Game",
            "type": 0,
            "assets": { "large_image": "img" }
        }"#;
        let a: Activity = serde_json::from_str(raw).expect("parse");
        assert!(a.assets.is_none(), "assets should be stripped on ingest");
    }

    #[test]
    fn secrets_stripped_on_deserialize() {
        let raw = r#"{
            "name": "Game",
            "type": 0,
            "secrets": { "join": "abc" }
        }"#;
        let a: Activity = serde_json::from_str(raw).expect("parse");
        assert!(a.secrets.is_none(), "secrets should be stripped on ingest");
    }

    #[test]
    fn unknown_activity_kind_fails_deserialize() {
        let raw = r#"{ "name": "Game", "type": 99 }"#;
        let err = serde_json::from_str::<Activity>(raw).expect_err("expected enum-tag error");
        assert!(
            err.to_string().contains("99") || err.to_string().contains("invalid"),
            "expected enum-tag error, got: {err}"
        );
    }

    #[test]
    fn reject_reason_serializes_snake_case() {
        let cases = [
            (SubscribeRejectReason::Forbidden, "forbidden"),
            (
                SubscribeRejectReason::TemporarilyUnavailable,
                "temporarily_unavailable",
            ),
            (SubscribeRejectReason::LimitExceeded, "limit_exceeded"),
        ];
        for (reason, expected) in cases {
            let json = serde_json::to_string(&reason).expect("serialize");
            assert_eq!(json, format!("\"{expected}\""));
        }
    }
}
