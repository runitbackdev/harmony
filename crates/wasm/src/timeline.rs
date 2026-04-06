use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap};
use std::rc::Rc;
use std::sync::Arc;

use futures_util::StreamExt;
use matrix_sdk::room::edit::EditedContent;
use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::events::room::message::{MessageType, RoomMessageEventContent};
use matrix_sdk::ruma::{OwnedRoomId, OwnedTransactionId, OwnedUserId};
use matrix_sdk_ui::timeline::{
    EventSendState, MembershipChange, ReactionStatus, TimelineDetails, TimelineEventItemId,
    TimelineItem, TimelineItemContent, TimelineItemKind, VirtualTimelineItem,
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
pub struct ReactionGroup {
    pub key: String,
    pub count: usize,
    pub senders: Vec<String>,
    pub pending: bool,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEventData {
    pub id: Option<String>,
    pub transaction_id: Option<String>,
    pub sender: Option<String>,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub timestamp: f64,
    pub content: TimelineContent,
    pub send_state: Option<SendState>,
    pub reactions: Option<Vec<ReactionGroup>>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "type", rename_all = "camelCase")]
pub struct Mentions {
    pub everyone: bool,
    pub user_ids: BTreeSet<OwnedUserId>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TimelineContent {
    #[serde(rename_all = "camelCase")]
    Message {
        body: String,
        formatted_body: Option<String>,
        msgtype: String,
        mentions: Option<Mentions>,
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

            let transaction_id = event.transaction_id().map(ToString::to_string);

            let reactions = event.content().reactions().map(|by_key| {
                by_key
                    .iter()
                    .map(|(key, senders)| {
                        let pending = senders
                            .values()
                            .any(|info| !matches!(info.status, ReactionStatus::RemoteToRemote(_)));
                        ReactionGroup {
                            key: key.clone(),
                            count: senders.len(),
                            senders: senders.keys().map(ToString::to_string).collect(),
                            pending,
                        }
                    })
                    .collect()
            });

            TimelineEventData {
                id: event.event_id().map(ToString::to_string),
                transaction_id,
                sender: Some(event.sender().to_string()),
                sender_name,
                sender_avatar,
                timestamp: event.timestamp().0.into(),
                content: convert_content(event.content()),
                send_state,
                reactions,
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
                transaction_id: None,
                sender: None,
                sender_name: None,
                sender_avatar: None,
                timestamp: 0.0,
                content: TimelineContent::Virtual { kind },
                send_state: None,
                reactions: None,
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
                    let formatted_body = match message.msgtype() {
                        MessageType::Text(t) => t.formatted.as_ref().map(|f| f.body.clone()),
                        MessageType::Notice(n) => n.formatted.as_ref().map(|f| f.body.clone()),
                        MessageType::Emote(e) => e.formatted.as_ref().map(|f| f.body.clone()),
                        _ => None,
                    };

                    TimelineContent::Message {
                        body: message.body().to_owned(),
                        formatted_body,
                        msgtype: message.msgtype().msgtype().to_owned(),
                        mentions: message.mentions().map(|m| Mentions {
                            everyone: m.room,
                            user_ids: m.user_ids.clone(),
                        }),
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

pub async fn send_message_impl(
    room_id: &str,
    body: &str,
    formatted_body: Option<&str>,
) -> Result<(), HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    let content = formatted_body.map_or_else(
        || RoomMessageEventContent::text_plain(body),
        |html| RoomMessageEventContent::text_html(body, html),
    );

    timeline
        .send(AnyMessageLikeEventContent::RoomMessage(content))
        .await?;

    Ok(())
}

pub async fn edit_message_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
    body: &str,
    formatted_body: Option<&str>,
) -> Result<(), HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| HarmonyError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(HarmonyError::InvalidUserId),
    };

    let content = formatted_body.map_or_else(
        || RoomMessageEventContent::text_plain(body),
        |html| RoomMessageEventContent::text_html(body, html),
    );

    timeline
        .edit(&item_id, EditedContent::RoomMessage(content.into()))
        .await?;

    Ok(())
}

pub async fn toggle_reaction_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
    key: &str,
) -> Result<bool, HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| HarmonyError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(HarmonyError::InvalidUserId),
    };

    let added = timeline.toggle_reaction(&item_id, key).await?;
    Ok(added)
}

pub async fn redact_message_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
) -> Result<(), HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| HarmonyError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(HarmonyError::InvalidUserId),
    };

    timeline.redact(&item_id, None).await?;

    Ok(())
}

pub async fn mark_as_read_impl(room_id: &str) -> Result<(), HarmonyError> {
    let parsed_id: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let timeline = TIMELINES.with(|timelines| timelines.borrow().get(&parsed_id).cloned());
    let timeline = timeline.ok_or(HarmonyError::RoomNotFound)?;

    timeline.mark_as_read(ReceiptType::Read).await?;
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
