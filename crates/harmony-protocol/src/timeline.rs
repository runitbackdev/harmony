use std::collections::HashMap;
use std::sync::Arc;

use futures_channel::{mpsc, oneshot};
use futures_util::{FutureExt, Stream, StreamExt};
use matrix_sdk::executor::spawn;
use matrix_sdk::room::edit::EditedContent;
use matrix_sdk::room::reply::{EnforceThread, Reply};
use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::events::room::message::{
    MessageType, RoomMessageEventContent, RoomMessageEventContentWithoutRelation,
};
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{OwnedEventId, OwnedRoomId, OwnedTransactionId};
use matrix_sdk_common::SendOutsideWasm;
use matrix_sdk_ui::timeline::{
    EmbeddedEvent, EventSendState, EventTimelineItem, MembershipChange, ReactionStatus,
    TimelineDetails, TimelineEventFocusThreadMode, TimelineEventItemId, TimelineFocus,
    TimelineItem, TimelineItemContent, TimelineItemKind, VirtualTimelineItem,
};

use crate::timeline::attachments::{ATTACHMENT_LIMIT_COUNT, Attachment};
use crate::{
    Command, Rpc, Shared, Subscription, client,
    diff::{ListDiff, convert_diffs},
    harmony, harmony_export,
    internal_error::InternalError,
};

pub mod attachments;

const DEFAULT_FOCUS_CONTEXT_EVENTS: u16 = 50;

#[harmony]
#[derive(Clone, Copy, Debug)]
pub enum TimelineMode {
    Live,
    Detached,
}

#[harmony]
#[derive(Clone, Copy, Debug)]
pub enum PaginationDirection {
    Forward,
    Backward,
}

#[harmony]
#[serde(tag = "kind")]
pub enum TimelineStreamMessage {
    Diffs {
        generation: u32,
        diffs: Vec<ListDiff<TimelineEventData>>,
    },
    Error {
        message: String,
    },
}

#[harmony]
pub struct PaginateResult {
    pub exhausted: bool,
    pub mode: TimelineMode,
    pub events: Option<Vec<TimelineEventData>>,
    pub generation: Option<u32>,
}

#[harmony]
pub struct ModeSwapResult {
    pub events: Vec<TimelineEventData>,
    pub mode: TimelineMode,
    pub generation: u32,
}

#[harmony]
pub struct RoomStateSnapshot {
    pub events: Vec<TimelineEventData>,
    pub mode: TimelineMode,
    pub generation: u32,
}

struct RoomState {
    live: Arc<matrix_sdk_ui::timeline::Timeline>,
    detached: Option<Arc<matrix_sdk_ui::timeline::Timeline>>,
    mode: TimelineMode,
    generation: u32,
    output_tx: mpsc::UnboundedSender<TimelineStreamMessage>,
    cancel_active: Option<oneshot::Sender<()>>,
}

static ROOMS: Shared<HashMap<OwnedRoomId, RoomState>> = Shared::new();

fn current_timeline(state: &RoomState) -> Arc<matrix_sdk_ui::timeline::Timeline> {
    match state.mode {
        TimelineMode::Live => state.live.clone(),
        TimelineMode::Detached => state.detached.clone().unwrap_or_else(|| state.live.clone()),
    }
}

fn with_room<F, R>(room_id: &str, f: F) -> Result<R, InternalError>
where
    F: FnOnce(&mut RoomState) -> Result<R, InternalError>,
{
    let parsed: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;
    ROOMS.with(|map| {
        let state = map.get_mut(&parsed).ok_or(InternalError::RoomNotFound)?;
        f(state)
    })
}

fn live_for_room(room_id: &str) -> Result<Arc<matrix_sdk_ui::timeline::Timeline>, InternalError> {
    let parsed: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;
    ROOMS
        .with(|map| map.get(&parsed).map(|s| s.live.clone()))
        .ok_or(InternalError::RoomNotFound)
}

#[harmony]
#[serde(tag = "state")]
pub enum SendState {
    NotSentYet,
    Sent,
    SendingFailed { error: String, is_recoverable: bool },
}

#[harmony]
pub struct ReactionGroup {
    pub key: String,
    pub count: u32,
    pub senders: Vec<String>,
    pub pending: bool,
}

#[harmony]
pub struct ReplyTarget {
    pub event_id: String,
    pub sender: Option<String>,
    pub sender_name: Option<String>,
    pub body: Option<String>,
    pub redacted: bool,
}

#[harmony]
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

#[harmony]
pub struct Mentions {
    pub everyone: bool,
    pub user_ids: Vec<String>,
}

#[harmony]
#[serde(tag = "type")]
pub enum TimelineContent {
    Message {
        body: String,
        formatted_body: Option<String>,
        msgtype: String,
        mentions: Option<Mentions>,
        edited: bool,
        attachments: Option<Vec<Attachment>>,
    },

    MembershipChange {
        user_id: String,
        change: String,
    },

    ProfileChange {
        display_name_change: Option<String>,
        avatar_url_change: Option<String>,
    },

    State {
        event_type: String,
    },

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
                            count: senders.len() as u32,
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
                content: convert_content(event, event.content()),
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

fn convert_content(event: &EventTimelineItem, content: &TimelineItemContent) -> TimelineContent {
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
                        attachments: Attachment::from_message(event, &message),
                        mentions: message.mentions().map(|m| Mentions {
                            everyone: m.room,
                            user_ids: m.user_ids.iter().map(ToString::to_string).collect(),
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
) -> Result<Arc<matrix_sdk_ui::timeline::Timeline>, InternalError> {
    let timeline = matrix_sdk_ui::timeline::TimelineBuilder::new(room)
        .with_focus(TimelineFocus::Live {
            hide_threaded_events: false,
        })
        .build()
        .await?;
    Ok(Arc::new(timeline))
}

async fn build_detached_timeline(
    room: &matrix_sdk::Room,
    target_event_id: OwnedEventId,
    num_context_events: u16,
) -> Result<Arc<matrix_sdk_ui::timeline::Timeline>, InternalError> {
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
    Ok(Arc::new(timeline))
}

async fn snapshot_and_forward(
    timeline: Arc<matrix_sdk_ui::timeline::Timeline>,
    generation: u32,
    output_tx: mpsc::UnboundedSender<TimelineStreamMessage>,
) -> (Vec<TimelineEventData>, oneshot::Sender<()>) {
    let (initial_items, incoming) = timeline.subscribe().await;
    let events: Vec<TimelineEventData> = initial_items.iter().map(convert_item).collect();
    let cancel = forward_diffs(incoming, generation, output_tx);
    (events, cancel)
}

/// Forward every stream item to `output_tx` on a spawned task until the stream
/// ends, the receiver drops, or the returned cancel handle fires. Target-neutral:
/// `spawn` routes to tokio (native) or `spawn_local` (wasm), and the
/// `SendOutsideWasm` bounds are `Send` on native / empty on wasm.
fn pump<S, T>(incoming: S, output_tx: mpsc::UnboundedSender<T>) -> oneshot::Sender<()>
where
    S: Stream<Item = T> + SendOutsideWasm + 'static,
    T: SendOutsideWasm + 'static,
{
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    spawn(async move {
        tracing::warn!("[echo-debug] pump: task STARTED");
        let mut cancel = cancel_rx.fuse();
        let mut stream = Box::pin(incoming).fuse();

        loop {
            futures_util::select_biased! {
                _ = cancel => {
                    tracing::warn!("[echo-debug] pump: CANCELLED (cancel_tx dropped)");
                    break;
                }
                next = stream.next() => {
                    let Some(item) = next else {
                        tracing::warn!("[echo-debug] pump: incoming stream ENDED");
                        break;
                    };
                    tracing::warn!("[echo-debug] pump: forwarding a diff batch -> output_tx");
                    if output_tx.unbounded_send(item).is_err() {
                        tracing::warn!("[echo-debug] pump: output_tx send FAILED (receiver gone)");
                        break;
                    }
                }
            }
        }
    });

    cancel_tx
}

fn forward_diffs<S>(
    incoming: S,
    generation: u32,
    output_tx: mpsc::UnboundedSender<TimelineStreamMessage>,
) -> oneshot::Sender<()>
where
    S: Stream<Item = Vec<matrix_sdk_ui::eyeball_im::VectorDiff<Arc<TimelineItem>>>>
        + SendOutsideWasm
        + 'static,
{
    let messages = incoming.map(move |diffs| TimelineStreamMessage::Diffs {
        generation,
        diffs: convert_diffs(diffs, convert_item),
    });
    pump(messages, output_tx)
}

#[harmony_export(domain = "timeline", action = "subscribe")]
pub async fn subscribe_room(
    room_id: String,
) -> Subscription<RoomStateSnapshot, TimelineStreamMessage> {
    subscribe_room_impl(room_id).await.into()
}

async fn subscribe_room_impl(
    room_id: String,
) -> Result<
    (
        RoomStateSnapshot,
        impl Stream<Item = TimelineStreamMessage> + SendOutsideWasm,
    ),
    InternalError,
> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let parsed: OwnedRoomId = room_id
        .as_str()
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;

    let room = client
        .get_room(&parsed)
        .ok_or(InternalError::RoomNotFound)?;
    let live = build_live_timeline(&room).await?;
    let _ = live.paginate_backwards(50).await;

    let (output_tx, output_rx) = mpsc::unbounded::<TimelineStreamMessage>();
    let generation: u32 = 1;
    let (events, cancel) = snapshot_and_forward(live.clone(), generation, output_tx.clone()).await;

    ROOMS.with(|map| {
        map.insert(
            parsed,
            RoomState {
                live,
                detached: None,
                mode: TimelineMode::Live,
                generation,
                output_tx,
                cancel_active: Some(cancel),
            },
        );
    });

    Ok((
        RoomStateSnapshot {
            events,
            mode: TimelineMode::Live,
            generation,
        },
        output_rx,
    ))
}

#[harmony]
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
) -> Result<ModeSwapResult, InternalError> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let parsed_room: OwnedRoomId = room_id
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;
    let parsed_event: OwnedEventId = target_event_id
        .try_into()
        .map_err(|_| InternalError::InvalidEventId)?;

    let room = client
        .get_room(&parsed_room)
        .ok_or(InternalError::RoomNotFound)?;
    let detached = build_detached_timeline(
        &room,
        parsed_event,
        num_context_events.unwrap_or(DEFAULT_FOCUS_CONTEXT_EVENTS),
    )
    .await?;

    let (output_tx, generation) = ROOMS.with(|map| -> Result<_, InternalError> {
        let state = map
            .get_mut(&parsed_room)
            .ok_or(InternalError::RoomNotFound)?;
        if let Some(c) = state.cancel_active.take() {
            let _ = c.send(());
        }
        state.detached = Some(detached.clone());
        state.mode = TimelineMode::Detached;
        state.generation = state.generation.wrapping_add(1);
        Ok((state.output_tx.clone(), state.generation))
    })?;

    let (events, cancel) = snapshot_and_forward(detached, generation, output_tx).await;

    ROOMS.with(|map| -> Result<(), InternalError> {
        let state = map
            .get_mut(&parsed_room)
            .ok_or(InternalError::RoomNotFound)?;
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

async fn return_to_live_impl(room_id: &str) -> Result<ModeSwapResult, InternalError> {
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

#[harmony]
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
) -> Result<PaginateResult, InternalError> {
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

#[harmony]
pub struct SendMessageInput {
    pub room_id: String,
    pub body: String,
    pub formatted_body: Option<String>,
    pub reply_to_event_id: Option<String>,
    pub attachments: Option<Vec<Attachment>>,
}

#[harmony_export(domain = "timeline", action = "send")]
pub async fn send_message(input: SendMessageInput) -> Rpc<()> {
    send_message_impl(
        &input.room_id,
        &input.body,
        input.formatted_body.as_deref(),
        input.reply_to_event_id.as_deref(),
        input.attachments,
    )
    .await
    .into()
}

async fn send_message_impl(
    room_id: &str,
    body: &str,
    formatted_body: Option<&str>,
    reply_to_event_id: Option<&str>,
    attachments_opt: Option<Vec<Attachment>>,
) -> Result<(), InternalError> {
    let timeline = live_for_room(room_id)?;
    let room = timeline.room();

    let mut json = serde_json::json!({
        "msgtype": "m.text",
        "body": body,
    });

    if let Some(html) = formatted_body {
        json["format"] = "org.matrix.custom.html".into();
        json["formatted_body"] = html.into();
    }

    if let Some(reply_id) = reply_to_event_id {
        let parsed: OwnedEventId = reply_id
            .try_into()
            .map_err(|_| InternalError::InvalidEventId)?;

        let content: RoomMessageEventContentWithoutRelation =
            serde_json::from_value(json).map_err(|_| InternalError::SerializationFailed)?;

        let reply = Reply {
            event_id: parsed,
            enforce_thread: EnforceThread::MaybeThreaded,
        };

        let content_with_reply = room
            .make_reply_event(content, reply)
            .await
            .map_err(|_| InternalError::ReplyFailed)?;

        json = serde_json::to_value(content_with_reply)
            .map_err(|_| InternalError::SerializationFailed)?;
    }

    if let Some(attachments) = attachments_opt {
        json["m.attachments"] = serde_json::to_value(
            attachments
                .into_iter()
                .take(ATTACHMENT_LIMIT_COUNT)
                .collect::<Vec<_>>(),
        )
        .map_err(|_| InternalError::SerializationFailed)?;
    }

    // Send through the queue, not `room.send_raw` — the latter posts directly to
    // the server and produces no local echo, so the live timeline only shows the
    // message once sync delivers it back. The queue path echoes immediately and
    // reconciles with the remote echo. Raw send preserves the custom
    // `m.attachments` field that typed content would drop.
    let raw =
        serde_json::value::to_raw_value(&json).map_err(|_| InternalError::SerializationFailed)?;
    room.send_queue()
        .send_raw(
            Raw::<AnyMessageLikeEventContent>::from_json(raw),
            "m.room.message".to_owned(),
        )
        .await
        .map_err(|e| InternalError::SendFailed(e.to_string()))?;

    Ok(())
}

#[harmony]
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
) -> Result<(), InternalError> {
    let timeline = live_for_room(room_id)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| InternalError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(InternalError::InvalidUserId),
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

#[harmony]
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
) -> Result<bool, InternalError> {
    let timeline = live_for_room(room_id)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| InternalError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(InternalError::InvalidUserId),
    };

    let added = timeline.toggle_reaction(&item_id, key).await?;
    Ok(added)
}

#[harmony]
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
) -> Result<(), InternalError> {
    let timeline = live_for_room(room_id)?;

    let item_id = match (event_id, transaction_id) {
        (Some(eid), _) => {
            TimelineEventItemId::EventId(eid.try_into().map_err(|_| InternalError::InvalidUserId)?)
        }
        (_, Some(tid)) => TimelineEventItemId::TransactionId(OwnedTransactionId::from(tid)),
        _ => return Err(InternalError::InvalidUserId),
    };

    timeline.redact(&item_id, None).await?;

    Ok(())
}

#[harmony_export(domain = "timeline", action = "mark_as_read")]
pub async fn mark_as_read(room_id: String) -> Command {
    mark_as_read_impl(&room_id).await.into()
}

async fn mark_as_read_impl(room_id: &str) -> Result<(), InternalError> {
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

async fn get_room_state_impl(room_id: &str) -> Result<RoomStateSnapshot, InternalError> {
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

// Native multi-thread smoke test for the streaming path (harmony-zwg.6).
//
// The production-faithful target (`subscribe_room_impl`) needs a live matrix
// client and `TimelineItem` (whose constructors are `pub(crate)`) — neither is
// fakeable here. So we test the generic `pump` primitive, the part the
// portability story actually rests on, plus compile-time `Send`/`Sync` asserts
// on the real private types.
#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use std::time::Duration;

    use futures_util::{StreamExt, stream};

    use super::*;

    const fn assert_send<T: Send>() {}
    const fn assert_send_sync<T: Send + Sync>() {}

    // Fails to compile if an `Rc`/`RefCell`/`thread_local!` regression creeps
    // back into the streaming path under the native runtime.
    #[test]
    fn streaming_types_are_thread_safe() {
        assert_send_sync::<RoomState>();
        assert_send_sync::<TimelineStreamMessage>();
        assert_send::<mpsc::UnboundedReceiver<TimelineStreamMessage>>();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn pump_forwards_in_order() {
        let (out_tx, out_rx) = mpsc::unbounded::<u32>();
        let _cancel = pump(stream::iter(vec![1, 2, 3]), out_tx);

        // Input stream ends -> task exits -> out_tx drops -> receiver terminates.
        let got: Vec<u32> = out_rx.collect().await;
        assert_eq!(got, vec![1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn pump_cancel_halts_forwarding() {
        let (in_tx, in_rx) = mpsc::unbounded::<u32>();
        let (out_tx, mut out_rx) = mpsc::unbounded::<u32>();
        let cancel = pump(in_rx, out_tx);

        in_tx.unbounded_send(1).expect("failed");
        assert_eq!(out_rx.next().await, Some(1));

        cancel.send(()).expect("failed");
        in_tx.unbounded_send(2).expect("failed");

        // `select_biased!` prefers the cancel arm, so the task breaks and drops
        // `out_tx` — the receiver terminates rather than yielding `2`.
        let next = tokio::time::timeout(Duration::from_millis(500), out_rx.next())
            .await
            .expect("receiver should resolve, not hang");
        assert_eq!(next, None);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn pump_stops_when_receiver_dropped() {
        let (in_tx, in_rx) = mpsc::unbounded::<u32>();
        let (out_tx, out_rx) = mpsc::unbounded::<u32>();
        let _cancel = pump(in_rx, out_tx);

        drop(out_rx);
        in_tx.unbounded_send(1).expect("failed"); // wakes the task -> send fails -> loop breaks

        // Loop break drops the input stream, closing our sender.
        tokio::time::timeout(Duration::from_millis(500), async {
            while !in_tx.is_closed() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("pump should drop its input after the receiver is gone");
    }
}
