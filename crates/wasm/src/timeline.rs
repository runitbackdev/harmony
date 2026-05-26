use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap};
use std::rc::Rc;
use std::sync::Arc;

use futures_channel::{mpsc, oneshot};
use futures_util::{FutureExt, StreamExt};
use harmony_protocol::{Command, Rpc, Subscription, harmony_export};
use matrix_sdk::room::edit::EditedContent;
use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::events::room::message::{MessageType, RoomMessageEventContent};
use matrix_sdk::ruma::{OwnedEventId, OwnedRoomId, OwnedTransactionId, OwnedUserId};
use matrix_sdk_ui::timeline::{
    EmbeddedEvent, EventSendState, MembershipChange, ReactionStatus, TimelineDetails,
    TimelineEventFocusThreadMode, TimelineEventItemId, TimelineFocus, TimelineItem,
    TimelineItemContent, TimelineItemKind, VirtualTimelineItem,
};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::JsValue;

use crate::{
    client,
    diff::{ListDiff, convert_diffs},
    errors::HarmonyError,
};

const DEFAULT_FOCUS_CONTEXT_EVENTS: u16 = 50;

#[derive(Tsify, Serialize, Clone, Copy, Debug)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "lowercase")]
pub enum TimelineMode {
    Live,
    Detached,
}

#[derive(Tsify, Deserialize, Clone, Copy, Debug)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "lowercase")]
pub enum PaginationDirection {
    Forward,
    Backward,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TimelineStreamMessage {
    #[serde(rename_all = "camelCase")]
    Diffs {
        generation: u32,
        diffs: Vec<ListDiff<TimelineEventData>>,
    },
    Error {
        message: String,
    },
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct PaginateResult {
    pub exhausted: bool,
    pub mode: TimelineMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<TimelineEventData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation: Option<u32>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ModeSwapResult {
    pub events: Vec<TimelineEventData>,
    pub mode: TimelineMode,
    pub generation: u32,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct RoomStateSnapshot {
    pub events: Vec<TimelineEventData>,
    pub mode: TimelineMode,
    pub generation: u32,
}

struct RoomState {
    live: Rc<matrix_sdk_ui::timeline::Timeline>,
    detached: Option<Rc<matrix_sdk_ui::timeline::Timeline>>,
    mode: TimelineMode,
    generation: u32,
    output_tx: mpsc::UnboundedSender<JsValue>,
    cancel_active: Option<oneshot::Sender<()>>,
}

thread_local! {
    static ROOMS: RefCell<HashMap<OwnedRoomId, RoomState>> = RefCell::new(HashMap::new());
}

fn current_timeline(state: &RoomState) -> Rc<matrix_sdk_ui::timeline::Timeline> {
    match state.mode {
        TimelineMode::Live => state.live.clone(),
        TimelineMode::Detached => state.detached.clone().unwrap_or_else(|| state.live.clone()),
    }
}

fn with_room<F, R>(room_id: &str, f: F) -> Result<R, HarmonyError>
where
    F: FnOnce(&mut RoomState) -> Result<R, HarmonyError>,
{
    let parsed: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidRoomId)?;
    ROOMS.with(|rooms| {
        let mut rooms = rooms.borrow_mut();
        let state = rooms.get_mut(&parsed).ok_or(HarmonyError::RoomNotFound)?;
        f(state)
    })
}

fn live_for_room(room_id: &str) -> Result<Rc<matrix_sdk_ui::timeline::Timeline>, HarmonyError> {
    let parsed: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidRoomId)?;
    ROOMS
        .with(|rooms| rooms.borrow().get(&parsed).map(|s| s.live.clone()))
        .ok_or(HarmonyError::RoomNotFound)
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
pub struct ReplyTarget {
    pub event_id: String,
    pub sender: Option<String>,
    pub sender_name: Option<String>,
    pub body: Option<String>,
    pub redacted: bool,
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
    pub reply_to: Option<ReplyTarget>,
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
        edited: bool,
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

fn extract_reply_target(content: &TimelineItemContent) -> Option<ReplyTarget> {
    let details = content.in_reply_to()?;
    let event_id = details.event_id.to_string();

    match details.event {
        TimelineDetails::Ready(boxed) => {
            let embedded: EmbeddedEvent = *boxed;
            let sender = Some(embedded.sender.to_string());
            let sender_name = match &embedded.sender_profile {
                TimelineDetails::Ready(profile) => profile.display_name.clone(),
                _ => None,
            };
            let msglike = embedded.content.as_msglike();
            let body = msglike
                .and_then(matrix_sdk_ui::timeline::MsgLikeContent::as_message)
                .map(|msg| msg.body().to_owned());
            let redacted = msglike
                .is_some_and(|m| matches!(m.kind, matrix_sdk_ui::timeline::MsgLikeKind::Redacted));
            Some(ReplyTarget {
                event_id,
                sender,
                sender_name,
                body,
                redacted,
            })
        }
        _ => Some(ReplyTarget {
            event_id,
            sender: None,
            sender_name: None,
            body: None,
            redacted: false,
        }),
    }
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

            let reply_to = extract_reply_target(event.content());

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
                reply_to,
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
                reply_to: None,
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
                        edited: message.is_edited(),
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

async fn build_live_timeline(
    room: &matrix_sdk::Room,
) -> Result<Rc<matrix_sdk_ui::timeline::Timeline>, HarmonyError> {
    let timeline = matrix_sdk_ui::timeline::TimelineBuilder::new(room)
        .with_focus(TimelineFocus::Live {
            hide_threaded_events: false,
        })
        .build()
        .await?;
    Ok(Rc::new(timeline))
}

async fn build_detached_timeline(
    room: &matrix_sdk::Room,
    target_event_id: OwnedEventId,
    num_context_events: u16,
) -> Result<Rc<matrix_sdk_ui::timeline::Timeline>, HarmonyError> {
    let timeline = matrix_sdk_ui::timeline::TimelineBuilder::new(room)
        .with_focus(TimelineFocus::Event {
            target: target_event_id,
            num_context_events,
            thread_mode: TimelineEventFocusThreadMode::Automatic {
                hide_threaded_events: false,
            },
        })
        .build()
        .await?;
    Ok(Rc::new(timeline))
}

async fn snapshot_and_forward(
    timeline: Rc<matrix_sdk_ui::timeline::Timeline>,
    generation: u32,
    output_tx: mpsc::UnboundedSender<JsValue>,
) -> (Vec<TimelineEventData>, oneshot::Sender<()>) {
    let (initial_items, incoming) = timeline.subscribe().await;
    let events: Vec<TimelineEventData> = initial_items.iter().map(convert_item).collect();
    let cancel = forward_diffs(incoming, generation, output_tx);
    (events, cancel)
}

fn forward_diffs<S>(
    incoming: S,
    generation: u32,
    output_tx: mpsc::UnboundedSender<JsValue>,
) -> oneshot::Sender<()>
where
    S: futures_util::Stream<Item = Vec<matrix_sdk_ui::eyeball_im::VectorDiff<Arc<TimelineItem>>>>
        + 'static,
{
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    wasm_bindgen_futures::spawn_local(async move {
        let mut cancel = cancel_rx.fuse();
        let mut stream = Box::pin(incoming).fuse();

        loop {
            futures_util::select_biased! {
                _ = cancel => break,
                next = stream.next() => {
                    let Some(diffs) = next else { break };
                    let msg = TimelineStreamMessage::Diffs {
                        generation,
                        diffs: convert_diffs(diffs, convert_item),
                    };
                    match serde_wasm_bindgen::to_value(&msg) {
                        Ok(value) => {
                            if output_tx.unbounded_send(value).is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::warn!("timeline diff serialization failed: {e}");
                            let err = TimelineStreamMessage::Error {
                                message: format!("serialization failed: {e}"),
                            };
                            if let Ok(v) = serde_wasm_bindgen::to_value(&err) {
                                let _ = output_tx.unbounded_send(v);
                            }
                        }
                    }
                }
            }
        }
    });

    cancel_tx
}

#[harmony_export(domain = "timeline", action = "subscribe")]
pub async fn subscribe_room(
    room_id: String,
) -> Subscription<RoomStateSnapshot, TimelineStreamMessage> {
    subscribe_room_impl(&room_id).await.into()
}

async fn subscribe_room_impl(
    room_id: &str,
) -> Result<(RoomStateSnapshot, web_sys::ReadableStream), HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let parsed: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidRoomId)?;

    let room = client.get_room(&parsed).ok_or(HarmonyError::RoomNotFound)?;
    let live = build_live_timeline(&room).await?;
    let _ = live.paginate_backwards(50).await;

    let (output_tx, output_rx) = mpsc::unbounded::<JsValue>();
    let generation: u32 = 1;
    let (events, cancel) = snapshot_and_forward(live.clone(), generation, output_tx.clone()).await;

    ROOMS.with(|rooms| {
        rooms.borrow_mut().insert(
            parsed,
            RoomState {
                live,
                detached: None,
                mode: TimelineMode::Live,
                generation,
                output_tx,
                cancel_active: Some(cancel),
            },
        )
    });

    let stream =
        wasm_streams::ReadableStream::from_stream(output_rx.map(Ok::<_, JsValue>)).into_raw();

    Ok((
        RoomStateSnapshot {
            events,
            mode: TimelineMode::Live,
            generation,
        },
        stream,
    ))
}

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct FocusOnEventInput {
    pub room_id: String,
    pub target_event_id: String,
    pub num_context_events: Option<u16>,
}

#[harmony_export(domain = "timeline", action = "focus_on_event")]
pub async fn focus_on_event(input: FocusOnEventInput) -> Rpc<ModeSwapResult> {
    focus_on_event_impl(
        &input.room_id,
        &input.target_event_id,
        input.num_context_events,
    )
    .await
    .into()
}

async fn focus_on_event_impl(
    room_id: &str,
    target_event_id: &str,
    num_context_events: Option<u16>,
) -> Result<ModeSwapResult, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let parsed_room: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidRoomId)?;
    let parsed_event: OwnedEventId = target_event_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidEventId)?;

    let room = client
        .get_room(&parsed_room)
        .ok_or(HarmonyError::RoomNotFound)?;
    let detached = build_detached_timeline(
        &room,
        parsed_event,
        num_context_events.unwrap_or(DEFAULT_FOCUS_CONTEXT_EVENTS),
    )
    .await?;

    let (output_tx, generation) = ROOMS.with(|rooms| -> Result<_, HarmonyError> {
        let mut rooms = rooms.borrow_mut();
        let state = rooms
            .get_mut(&parsed_room)
            .ok_or(HarmonyError::RoomNotFound)?;
        if let Some(c) = state.cancel_active.take() {
            let _ = c.send(());
        }
        state.detached = Some(detached.clone());
        state.mode = TimelineMode::Detached;
        state.generation = state.generation.wrapping_add(1);
        Ok((state.output_tx.clone(), state.generation))
    })?;

    let (events, cancel) = snapshot_and_forward(detached, generation, output_tx).await;

    ROOMS.with(|rooms| -> Result<(), HarmonyError> {
        let mut rooms = rooms.borrow_mut();
        let state = rooms
            .get_mut(&parsed_room)
            .ok_or(HarmonyError::RoomNotFound)?;
        if state.generation == generation {
            state.cancel_active = Some(cancel);
        }
        Ok(())
    })?;

    Ok(ModeSwapResult {
        events,
        mode: TimelineMode::Detached,
        generation,
    })
}

#[harmony_export(domain = "timeline", action = "return_to_live")]
pub async fn return_to_live(room_id: String) -> Rpc<ModeSwapResult> {
    return_to_live_impl(&room_id).await.into()
}

async fn return_to_live_impl(room_id: &str) -> Result<ModeSwapResult, HarmonyError> {
    let (live, output_tx, generation, was_already_live) = with_room(room_id, |state| {
        if matches!(state.mode, TimelineMode::Live) {
            return Ok((
                state.live.clone(),
                state.output_tx.clone(),
                state.generation,
                true,
            ));
        }
        if let Some(c) = state.cancel_active.take() {
            let _ = c.send(());
        }
        state.detached = None;
        state.mode = TimelineMode::Live;
        state.generation = state.generation.wrapping_add(1);
        Ok((
            state.live.clone(),
            state.output_tx.clone(),
            state.generation,
            false,
        ))
    })?;

    if was_already_live {
        let items = live.items().await;
        let events = items.iter().map(convert_item).collect();
        return Ok(ModeSwapResult {
            events,
            mode: TimelineMode::Live,
            generation,
        });
    }

    let (events, cancel) = snapshot_and_forward(live, generation, output_tx).await;

    with_room(room_id, |state| {
        if state.generation == generation {
            state.cancel_active = Some(cancel);
        }
        Ok(())
    })?;

    Ok(ModeSwapResult {
        events,
        mode: TimelineMode::Live,
        generation,
    })
}

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct PaginateInput {
    pub room_id: String,
    pub direction: PaginationDirection,
    pub count: u16,
}

#[harmony_export(domain = "timeline", action = "paginate")]
pub async fn paginate_room(input: PaginateInput) -> Rpc<PaginateResult> {
    paginate_room_impl(&input.room_id, input.direction, input.count)
        .await
        .into()
}

async fn paginate_room_impl(
    room_id: &str,
    direction: PaginationDirection,
    count: u16,
) -> Result<PaginateResult, HarmonyError> {
    let (timeline, mode) = with_room(room_id, |state| Ok((current_timeline(state), state.mode)))?;

    let exhausted = match direction {
        PaginationDirection::Backward => timeline.paginate_backwards(count).await?,
        PaginationDirection::Forward => timeline.paginate_forwards(count).await?,
    };

    if matches!(direction, PaginationDirection::Forward)
        && exhausted
        && matches!(mode, TimelineMode::Detached)
    {
        let swap = return_to_live_impl(room_id).await?;
        return Ok(PaginateResult {
            exhausted,
            mode: swap.mode,
            events: Some(swap.events),
            generation: Some(swap.generation),
        });
    }

    Ok(PaginateResult {
        exhausted,
        mode,
        events: None,
        generation: None,
    })
}

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub room_id: String,
    pub body: String,
    pub formatted_body: Option<String>,
    pub reply_to_event_id: Option<String>,
}

#[harmony_export(domain = "timeline", action = "send")]
pub async fn send_message(input: SendMessageInput) -> Rpc<()> {
    send_message_impl(
        &input.room_id,
        &input.body,
        input.formatted_body.as_deref(),
        input.reply_to_event_id.as_deref(),
    )
    .await
    .into()
}

async fn send_message_impl(
    room_id: &str,
    body: &str,
    formatted_body: Option<&str>,
    reply_to_event_id: Option<&str>,
) -> Result<(), HarmonyError> {
    let timeline = live_for_room(room_id)?;

    let content = formatted_body.map_or_else(
        || RoomMessageEventContent::text_plain(body),
        |html| RoomMessageEventContent::text_html(body, html),
    );

    if let Some(reply_id) = reply_to_event_id {
        let parsed: OwnedEventId = reply_id
            .try_into()
            .map_err(|_| HarmonyError::InvalidEventId)?;
        timeline.send_reply(content.into(), parsed).await?;
    } else {
        timeline
            .send(AnyMessageLikeEventContent::RoomMessage(content))
            .await?;
    }

    Ok(())
}

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct EditMessageInput {
    pub room_id: String,
    pub event_id: Option<String>,
    pub transaction_id: Option<String>,
    pub body: String,
    pub formatted_body: Option<String>,
}

#[harmony_export(domain = "timeline", action = "edit")]
pub async fn edit_message(input: EditMessageInput) -> Rpc<()> {
    edit_message_impl(
        &input.room_id,
        input.event_id.as_deref(),
        input.transaction_id.as_deref(),
        &input.body,
        input.formatted_body.as_deref(),
    )
    .await
    .into()
}

async fn edit_message_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
    body: &str,
    formatted_body: Option<&str>,
) -> Result<(), HarmonyError> {
    let timeline = live_for_room(room_id)?;

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

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ToggleReactionInput {
    pub room_id: String,
    pub event_id: Option<String>,
    pub transaction_id: Option<String>,
    pub key: String,
}

#[harmony_export(domain = "timeline", action = "toggle_reaction")]
pub async fn toggle_reaction(input: ToggleReactionInput) -> Rpc<bool> {
    toggle_reaction_impl(
        &input.room_id,
        input.event_id.as_deref(),
        input.transaction_id.as_deref(),
        &input.key,
    )
    .await
    .into()
}

async fn toggle_reaction_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
    key: &str,
) -> Result<bool, HarmonyError> {
    let timeline = live_for_room(room_id)?;

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

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct RedactMessageInput {
    pub room: String,
    pub event: Option<String>,
    pub transaction: Option<String>,
}

#[harmony_export(domain = "timeline", action = "redact")]
pub async fn redact_message(input: RedactMessageInput) -> Rpc<()> {
    redact_message_impl(
        &input.room,
        input.event.as_deref(),
        input.transaction.as_deref(),
    )
    .await
    .into()
}

async fn redact_message_impl(
    room_id: &str,
    event_id: Option<&str>,
    transaction_id: Option<&str>,
) -> Result<(), HarmonyError> {
    let timeline = live_for_room(room_id)?;

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

#[harmony_export(domain = "timeline", action = "mark_as_read")]
pub async fn mark_as_read(room_id: String) -> Command {
    mark_as_read_impl(&room_id).await.into()
}

async fn mark_as_read_impl(room_id: &str) -> Result<(), HarmonyError> {
    let timeline = live_for_room(room_id)?;
    timeline.mark_as_read(ReceiptType::Read).await?;
    Ok(())
}

#[harmony_export(
    domain = "timeline",
    action = "get_room_state",
    snapshot_for = "timeline.subscribe"
)]
pub async fn get_room_state(room_id: String) -> Rpc<RoomStateSnapshot> {
    get_room_state_impl(&room_id).await.into()
}

async fn get_room_state_impl(room_id: &str) -> Result<RoomStateSnapshot, HarmonyError> {
    let (timeline, mode, generation) = with_room(room_id, |state| {
        Ok((current_timeline(state), state.mode, state.generation))
    })?;
    let items = timeline.items().await;
    Ok(RoomStateSnapshot {
        events: items.iter().map(convert_item).collect(),
        mode,
        generation,
    })
}
