use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap};
use std::rc::Rc;
use std::sync::Arc;

use futures_util::StreamExt;
use matrix_sdk::ruma::{OwnedRoomId, OwnedUserId};
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use matrix_sdk_ui::timeline::{
    EventSendState, MembershipChange, TimelineDetails, TimelineItem, TimelineItemContent,
    TimelineItemKind, VirtualTimelineItem,
};
use serde::Serialize;
use tsify_next::Tsify;

use crate::{client, diff::serialize_diffs, errors::HarmonyError, subscription::Subscription};

thread_local! {
    static TIMELINES: RefCell<HashMap<OwnedRoomId, Rc<matrix_sdk_ui::timeline::Timeline>>> =
        RefCell::new(HashMap::new());
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SendState {
    NotSentYet,
    Sent,
    #[serde(rename_all = "camelCase")]
    SendingFailed {
        error: String,
        is_recoverable: bool,
    },
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEventData {
    pub id: Option<String>,
    pub sender: Option<String>,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub timestamp: f64,
    pub content: TimelineContent,
    pub send_state: Option<SendState>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "type", rename_all = "camelCase")]
pub struct Mentions {
    pub everyone: bool,
    pub user_ids: BTreeSet<OwnedUserId>
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TimelineContent {
    #[serde(rename_all = "camelCase")]
    Message {
        body: String,
        msgtype: String,
        mentions: Option<Mentions>
    },

    #[serde(rename_all = "camelCase")]
    MembershipChange {
        user_id: String,
        change: String,
    },

    #[serde(rename_all = "camelCase")]
    ProfileChange {
        display_name_change: Option<String>,
        avatar_url_change: Option<String>,
    },

    #[serde(rename_all = "camelCase")]
    State {
        event_type: String,
    },

    #[serde(rename_all = "camelCase")]
    Virtual {
        kind: String,
    },

    Unknown {},
}

fn convert_item(item: &Arc<TimelineItem>) -> TimelineEventData {
    match item.kind() {
        TimelineItemKind::Event(event) => {
            let (sender_name, sender_avatar) = match event.sender_profile() {
                TimelineDetails::Ready(profile) => (
                    profile.display_name.clone(),
                    profile.avatar_url.as_ref().map(ToString::to_string),
                ),
                _ => (None, None),
            };

            let send_state = event.send_state().map(|state| match state {
                EventSendState::NotSentYet { .. } => SendState::NotSentYet,
                EventSendState::Sent { .. } => SendState::Sent,
                EventSendState::SendingFailed {
                    error,
                    is_recoverable,
                } => SendState::SendingFailed {
                    error: error.to_string(),
                    is_recoverable: *is_recoverable,
                },
            });

            TimelineEventData {
                id: event.event_id().map(ToString::to_string),
                sender: Some(event.sender().to_string()),
                sender_name,
                sender_avatar,
                timestamp: event.timestamp().0.into(),
                content: convert_content(event.content()),
                send_state,
            }
        }

        TimelineItemKind::Virtual(virtual_item) => {
            let kind = match virtual_item {
                VirtualTimelineItem::DateDivider(ts) => format!("date_divider:{}", ts.0),
                VirtualTimelineItem::ReadMarker => "read_marker".to_owned(),
                VirtualTimelineItem::TimelineStart => "timeline_start".to_owned(),
            };

            TimelineEventData {
                id: None,
                sender: None,
                sender_name: None,
                sender_avatar: None,
                timestamp: 0.0,
                content: TimelineContent::Virtual { kind },
                send_state: None,
            }
        }
    }
}

fn convert_content(content: &TimelineItemContent) -> TimelineContent {
    match content {
        TimelineItemContent::MsgLike(msg_like) => {
            msg_like
                .as_message()
                .map_or(TimelineContent::Unknown {}, |message| {
                    TimelineContent::Message {
                        body: message.body().to_owned(),
                        msgtype: message.msgtype().msgtype().to_owned(),
                        mentions: message.mentions().map(|m| Mentions {
                            everyone: m.room,
                            user_ids: m.user_ids.to_owned()
                        })
                    }
                })
        }

        TimelineItemContent::MembershipChange(change) => {
            let change_str = change.change().map_or("unknown", |c| match c {
                MembershipChange::Joined => "joined",
                MembershipChange::Left => "left",
                MembershipChange::Banned => "banned",
                MembershipChange::Unbanned => "unbanned",
                MembershipChange::Kicked => "kicked",
                MembershipChange::Invited => "invited",
                MembershipChange::KickedAndBanned => "kicked_and_banned",
                MembershipChange::InvitationAccepted => "invitation_accepted",
                MembershipChange::InvitationRejected => "invitation_rejected",
                MembershipChange::InvitationRevoked => "invitation_revoked",
                MembershipChange::Knocked => "knocked",
                MembershipChange::KnockAccepted => "knock_accepted",
                MembershipChange::KnockRetracted => "knock_retracted",
                MembershipChange::KnockDenied => "knock_denied",
                _ => "unknown",
            });

            TimelineContent::MembershipChange {
                user_id: change.user_id().to_string(),
                change: change_str.to_owned(),
            }
        }

        TimelineItemContent::ProfileChange(change) => {
            let display_name_change = change.displayname_change().and_then(|c| c.new.clone());
            let avatar_url_change = change
                .avatar_url_change()
                .and_then(|c| c.new.as_ref().map(ToString::to_string));

            TimelineContent::ProfileChange {
                display_name_change,
                avatar_url_change,
            }
        }

        TimelineItemContent::OtherState(state) => TimelineContent::State {
            event_type: state.content().event_type().to_string(),
        },

        _ => TimelineContent::Unknown {},
    }
}

pub async fn subscribe_timeline_impl(
    room_id: &str,
) -> Result<Subscription<TimelineEventData>, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let room = client
        .get_room(&parsed_id)
        .ok_or(HarmonyError::RoomNotFound)?;

    let timeline = matrix_sdk_ui::timeline::TimelineBuilder::new(&room)
        .build()
        .await?;

    let timeline = Rc::new(timeline);

    TIMELINES.with(|timelines| timelines.borrow_mut().insert(parsed_id, timeline.clone()));

    let _ = timeline.paginate_backwards(50).await;

    let (initial_items, incoming) = timeline.subscribe().await;

    let initial = initial_items.iter().map(convert_item).collect();
    let updates = incoming.map(|diffs| serialize_diffs(diffs, convert_item));
    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();

    Ok(Subscription { initial, stream })
}

pub async fn paginate_backwards_impl(room_id: &str, count: u16) -> Result<bool, HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    let hit_start = timeline.paginate_backwards(count).await?;
    Ok(hit_start)
}

pub async fn send_message_impl(room_id: &str, body: &str) -> Result<(), HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    timeline
        .send(AnyMessageLikeEventContent::RoomMessage(
            RoomMessageEventContent::text_plain(body),
        ))
        .await?;

    Ok(())
}

pub async fn get_timeline_impl(room_id: &str) -> Result<Vec<TimelineEventData>, HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());

    let Some(timeline) = timeline else {
        return Ok(vec![]);
    };

    let items = timeline.items().await;
    Ok(items.iter().map(convert_item).collect())
}
