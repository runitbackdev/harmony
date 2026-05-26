use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use nanoid::nanoid;
use ruma::OwnedRoomId;
use tokio::sync::mpsc;

use tokio_util::sync::CancellationToken;

use crate::auth::TokenCache;
use crate::matrix::{AuthError, Identity};
use crate::membership::{MembersSet, MembershipCache};
use crate::presence::fanout::PresenceFanout;
use crate::presence::protocol::{
    ClientFrame, ClientType, CloseCode, Dispatch, ErrorCode, HelloPayload, ReadyPayload,
    RejectedSpace, ServerFrame, SubscribePayload, SubscribeRejectReason, SubscribedPayload,
    UnsubscribePayload, UnsubscribedPayload, WsErrorPayload,
};
use crate::presence::rate_limit::{CheckOutcome, FrameKind, RateLimiters, CLOSE_RETRY_AFTER_MS};
use crate::presence::registry::PresenceRegistry;
use crate::presence::subscriptions::SubscriptionRegistry;
use crate::presence::ConnId;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const HEARTBEAT_GRACE: Duration = Duration::from_secs(45);

pub struct Deps {
    pub tokens: TokenCache,
    pub registry: Arc<PresenceRegistry>,
    pub fanout: Arc<PresenceFanout>,
    pub subscriptions: Arc<SubscriptionRegistry>,
    pub membership: MembershipCache,
    pub identify_timeout: Duration,
    pub max_spaces_per_subscribe: usize,
    pub max_subscriptions_per_conn: usize,
    pub auto_idle: Duration,
    pub shutdown: CancellationToken,
}

fn log_auth_failure(conn: &str, err: &AuthError) {
    match err {
        AuthError::Invalid => tracing::info!(conn, "ws auth failed: invalid token"),
        AuthError::Forbidden => tracing::warn!(conn, "ws auth failed: forbidden"),
        AuthError::RateLimited(ms) => {
            tracing::warn!(conn, retry_after_ms = ms, "ws auth failed: rate limited");
        }
        AuthError::Upstream => tracing::error!(conn, "ws auth failed: homeserver unavailable"),
    }
}

pub struct Connection {
    socket: WebSocket,
    id: ConnId,
    identity: Option<Identity>,
    registry: Arc<PresenceRegistry>,
    fanout: Arc<PresenceFanout>,
    subscriptions: Arc<SubscriptionRegistry>,
    membership: MembershipCache,
    identify_timeout: Duration,
    max_spaces_per_subscribe: usize,
    max_subscriptions_per_conn: usize,
    auto_idle: Duration,
    shutdown: CancellationToken,
    rate_limiters: RateLimiters,
}

impl Connection {
    pub async fn run(socket: WebSocket, deps: Deps) {
        let Deps {
            tokens,
            registry,
            fanout,
            subscriptions,
            membership,
            identify_timeout,
            max_spaces_per_subscribe,
            max_subscriptions_per_conn,
            auto_idle,
            shutdown,
        } = deps;

        let mut conn = Self {
            socket,
            id: ConnId::new(nanoid!(16)),
            identity: None,
            registry,
            fanout,
            subscriptions,
            membership,
            identify_timeout,
            max_spaces_per_subscribe,
            max_subscriptions_per_conn,
            auto_idle,
            shutdown,
            rate_limiters: RateLimiters::new(),
        };

        let client_type = match conn.handshake(&tokens).await {
            Ok(ct) => ct,
            Err(code) => {
                conn.close(code).await;
                return;
            }
        };

        let identity = conn
            .identity
            .clone()
            .expect("identity set on handshake success");

        // Lazy cache warm: pre-pull joined_rooms so the user's first
        // UpdatePresence doesn't pay cold-cache latency in fanout's
        // spaces_of(sender) lookup.
        conn.membership.prefetch_spaces_of(&identity.user_id);

        conn.registry.hydrate_custom_status(&identity.user_id).await;

        let rx = conn.fanout.register(conn.id.clone());
        conn.registry
            .connect(&identity.user_id, conn.id.clone(), client_type);

        conn.main_loop(rx, &identity).await;
    }

    async fn handshake(&mut self, tokens: &TokenCache) -> Result<Option<ClientType>, CloseCode> {
        let heartbeat_interval_ms =
            u64::try_from(HEARTBEAT_INTERVAL.as_millis()).unwrap_or(u64::MAX);
        self.send(ServerFrame::Hello(HelloPayload {
            heartbeat_interval_ms,
        }))
        .await?;

        let shutdown = self.shutdown.clone();
        let frame = tokio::select! {
            biased;
            () = shutdown.cancelled() => return Err(CloseCode::Shutdown),
            res = tokio::time::timeout(self.identify_timeout, self.recv_frame()) => {
                res.map_err(|_| CloseCode::AuthTimeout)??
            }
        };

        let ClientFrame::Identify(payload) = frame else {
            return Err(CloseCode::AuthRequired);
        };

        let identity = tokens.resolve(&payload.token).await.map_err(|err| {
            log_auth_failure(self.id.as_str(), &err);
            CloseCode::from(err)
        })?;

        self.send(ServerFrame::Dispatch(Dispatch::Ready(ReadyPayload {
            user_id: identity.user_id.clone(),
            session_id: self.id.as_str().to_string(),
        })))
        .await?;

        tracing::info!(
            user_id = %identity.user_id,
            conn = %self.id.as_str(),
            "ws session established"
        );
        self.identity = Some(identity);

        Ok(payload.client_type)
    }

    async fn main_loop(&mut self, mut rx: mpsc::Receiver<ServerFrame>, identity: &Identity) {
        let mut grace_timer = tokio::time::interval(HEARTBEAT_GRACE);
        grace_timer.tick().await;
        let mut idle_timer = tokio::time::interval(self.auto_idle);
        idle_timer.tick().await;

        loop {
            tokio::select! {
                msg = self.socket.recv() => {
                    let Some(result) = msg else { return };
                    let message = match result {
                        Ok(m) => m,
                        Err(e) => {
                            tracing::warn!("ws recv error: {e}");
                            return;
                        }
                    };

                    let frame = match Self::parse_message(message) {
                        Ok(Some(f)) => f,
                        Ok(None) => continue,
                        Err(code) => {
                            self.close(code).await;
                            return;
                        }
                    };

                    let is_heartbeat = matches!(frame, ClientFrame::Heartbeat);

                    if let Err(code) = self.handle_frame(frame, identity).await {
                        self.close(code).await;
                        return;
                    }

                    idle_timer.reset();
                    if is_heartbeat {
                        grace_timer.reset();
                    }
                }
                Some(out) = rx.recv() => {
                    if self.send(out).await.is_err() {
                        return;
                    }
                }
                _ = grace_timer.tick() => {
                    self.close(CloseCode::HeartbeatTimeout).await;
                    return;
                }
                _ = idle_timer.tick() => {
                    self.registry.auto_idle(&identity.user_id, &self.id);
                }
                () = self.shutdown.cancelled() => {
                    self.close(CloseCode::Shutdown).await;
                    return;
                }
            }
        }
    }

    fn parse_message(msg: Message) -> Result<Option<ClientFrame>, CloseCode> {
        match msg {
            Message::Text(text) => serde_json::from_str(&text)
                .map(Some)
                .map_err(|_| CloseCode::DecodeError),
            Message::Binary(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|_| CloseCode::DecodeError),
            Message::Ping(_) | Message::Pong(_) => Ok(None),
            Message::Close(_) => Err(CloseCode::Internal),
        }
    }

    async fn handle_frame(
        &mut self,
        frame: ClientFrame,
        identity: &Identity,
    ) -> Result<(), CloseCode> {
        match self.rate_limiters.check(FrameKind::from_frame(&frame)) {
            CheckOutcome::Allow => {}
            CheckOutcome::Drop => {
                tracing::debug!(
                    conn = %self.id.as_str(),
                    user_id = %identity.user_id,
                    "frame rate-limited; dropped"
                );
                self.send(ServerFrame::Error(WsErrorPayload {
                    code: ErrorCode::RateLimited,
                    message: "rate limited".to_string(),
                    retry_after_ms: None,
                }))
                .await?;
                return Ok(());
            }
            CheckOutcome::Close => {
                tracing::warn!(
                    conn = %self.id.as_str(),
                    user_id = %identity.user_id,
                    "abuse threshold exceeded; closing"
                );
                return Err(CloseCode::RateLimited {
                    retry_after_ms: CLOSE_RETRY_AFTER_MS,
                });
            }
        }

        match frame {
            ClientFrame::Heartbeat => {
                self.send(ServerFrame::HeartbeatAck).await?;
            }
            ClientFrame::UpdatePresence(mut p) => {
                if let Err(err) = p.validate() {
                    tracing::info!(
                        user_id = %identity.user_id,
                        conn = %self.id.as_str(),
                        ?err,
                        "presence validation failed"
                    );
                    return Err(CloseCode::DecodeError);
                }
                Self::apply_custom_status(&self.registry, &identity.user_id, &mut p).await;
                self.registry.update(&identity.user_id, &self.id, p);
            }
            ClientFrame::ClientIdle(payload) => {
                if payload.idle {
                    self.registry.auto_idle(&identity.user_id, &self.id);
                }
            }
            ClientFrame::Subscribe(payload) => {
                self.handle_subscribe(payload, identity).await?;
            }
            ClientFrame::Unsubscribe(payload) => {
                self.handle_unsubscribe(payload).await?;
            }
            ClientFrame::Identify(_) => {
                return Err(CloseCode::AlreadyAuthed);
            }
        }
        Ok(())
    }

    async fn apply_custom_status(
        registry: &Arc<PresenceRegistry>,
        user_id: &ruma::UserId,
        presence: &mut crate::presence::protocol::Presence,
    ) {
        use crate::presence::custom_status::CustomStatusData;
        use crate::presence::protocol::ActivityKind;

        let idx = presence
            .activities
            .iter()
            .position(|a| a.kind == ActivityKind::Custom);
        let Some(idx) = idx else { return };
        let act = presence.activities.remove(idx);
        let data = CustomStatusData::from_activity(&act);
        let is_empty = data.text.as_deref().unwrap_or("").is_empty() && data.emoji_name.is_none();
        if is_empty {
            registry.clear_custom_status(user_id).await;
        } else {
            registry.set_custom_status(user_id, data).await;
        }
    }

    async fn handle_subscribe(
        &mut self,
        payload: SubscribePayload,
        identity: &Identity,
    ) -> Result<(), CloseCode> {
        // Per-frame cap: hard close (caller is misbehaving).
        if payload.space_ids.len() > self.max_spaces_per_subscribe {
            return Err(CloseCode::PayloadTooLarge);
        }

        // Auth: one spaces_of call per Subscribe, intersect against request.
        // On upstream failure, reject everything as temporarily-unavailable
        // and keep the conn alive — conn health is independent of HS health.
        let user_spaces = match self.membership.spaces_of(&identity.user_id).await {
            Ok(spaces) => Some(spaces),
            Err(err) => {
                tracing::warn!(
                    user_id = %identity.user_id,
                    conn = %self.id.as_str(),
                    ?err,
                    "spaces_of failed during Subscribe; rejecting all as TemporarilyUnavailable"
                );
                None
            }
        };

        let mut auth_accepted: Vec<OwnedRoomId> = Vec::with_capacity(payload.space_ids.len());
        let mut rejected: Vec<RejectedSpace> = Vec::new();
        for space in payload.space_ids {
            match user_spaces.as_ref() {
                Some(spaces) if spaces.contains(&space) => auth_accepted.push(space),
                Some(_) => rejected.push(RejectedSpace {
                    space_id: space,
                    reason: SubscribeRejectReason::Forbidden,
                }),
                None => rejected.push(RejectedSpace {
                    space_id: space,
                    reason: SubscribeRejectReason::TemporarilyUnavailable,
                }),
            }
        }

        // Per-conn cap: overflow is rejected (don't close — different conn's
        // sub set isn't the caller's fault to know in advance).
        let already = self.subscriptions.conn_sub_count(&self.id);
        let remaining_budget = self.max_subscriptions_per_conn.saturating_sub(already);
        if auth_accepted.len() > remaining_budget {
            let overflow = auth_accepted.split_off(remaining_budget);
            for space in overflow {
                rejected.push(RejectedSpace {
                    space_id: space,
                    reason: SubscribeRejectReason::LimitExceeded,
                });
            }
        }

        // Member fetch: prove every surviving accepted space is reachable
        // AND collect per-space membership for snapshot construction. A
        // members_of failure for any S demotes S to rejected without
        // affecting the rest.
        let mut final_accepted: Vec<OwnedRoomId> = Vec::with_capacity(auth_accepted.len());
        let mut members_by_space: Vec<(OwnedRoomId, MembersSet)> =
            Vec::with_capacity(auth_accepted.len());
        for space in auth_accepted {
            match self.membership.members_of(&space).await {
                Ok(members) => {
                    members_by_space.push((space.clone(), members));
                    final_accepted.push(space);
                }
                Err(err) => {
                    tracing::warn!(
                        %space,
                        conn = %self.id.as_str(),
                        ?err,
                        "members_of failed during Subscribe; demoting space"
                    );
                    rejected.push(RejectedSpace {
                        space_id: space,
                        reason: SubscribeRejectReason::TemporarilyUnavailable,
                    });
                }
            }
        }

        // Register first so fanout reaches us during snapshot build. Updates
        // in the small window between register and send may appear both in
        // snapshot and as a fanout event — duplicate is preferable to miss
        // for current-state presence.
        let newly = self
            .subscriptions
            .subscribe_many(&self.id, final_accepted.clone());

        // Snapshot only for newly-added spaces. Re-Subscribing an
        // already-subscribed space is a no-op and must not re-emit.
        let snapshots = if newly.is_empty() {
            Vec::new()
        } else {
            let newly_set: HashSet<&OwnedRoomId> = newly.iter().collect();
            let mut newly_union: HashSet<ruma::OwnedUserId> = HashSet::new();
            for (space, members) in &members_by_space {
                if newly_set.contains(space) {
                    for user in members.iter() {
                        newly_union.insert(user.clone());
                    }
                }
            }
            self.registry
                .snapshot_for_members(&newly_union, &identity.user_id)
        };

        let frame = ServerFrame::Dispatch(Dispatch::Subscribed(SubscribedPayload {
            accepted: final_accepted,
            rejected,
            snapshots,
        }));
        self.push_via_fanout(frame).await
    }

    async fn handle_unsubscribe(&mut self, payload: UnsubscribePayload) -> Result<(), CloseCode> {
        let removed = self
            .subscriptions
            .unsubscribe_many(&self.id, payload.space_ids);
        let frame = ServerFrame::Dispatch(Dispatch::Unsubscribed(UnsubscribedPayload {
            space_ids: removed,
        }));
        self.push_via_fanout(frame).await
    }

    /// Push a server frame onto the conn's outbound sink. Errors map to
    /// `Internal` so the handler closes the conn — a dead sink means we
    /// can't honor the protocol.
    ///
    /// Takes `&mut self` so the returned future is `Send`-safe through the
    /// axum upgrade callback even though no field is mutated here.
    #[allow(clippy::needless_pass_by_ref_mut)]
    async fn push_via_fanout(&mut self, frame: ServerFrame) -> Result<(), CloseCode> {
        if self.fanout.push_to(&self.id, frame).await.is_err() {
            return Err(CloseCode::Internal);
        }
        Ok(())
    }

    async fn recv_frame(&mut self) -> Result<ClientFrame, CloseCode> {
        loop {
            let msg = self
                .socket
                .recv()
                .await
                .ok_or(CloseCode::Internal)?
                .map_err(|_| CloseCode::Internal)?;

            if let Some(frame) = Self::parse_message(msg)? {
                return Ok(frame);
            }
        }
    }

    async fn send(&mut self, frame: ServerFrame) -> Result<(), CloseCode> {
        let text = serde_json::to_string(&frame).map_err(|_| CloseCode::Internal)?;
        self.socket
            .send(Message::Text(text.into()))
            .await
            .map_err(|_| CloseCode::Internal)?;
        Ok(())
    }

    async fn close(&mut self, code: CloseCode) {
        let (wire, reason) = code.wire();
        let _ = self
            .socket
            .send(Message::Close(Some(CloseFrame {
                code: wire,
                reason: reason.into_owned().into(),
            })))
            .await;
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        let Some(identity) = self.identity.as_ref() else {
            return;
        };
        self.registry.disconnect(&identity.user_id, &self.id);
        self.fanout.unregister(&self.id);
        self.subscriptions.cleanup(&self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_message_text_identify_returns_frame() {
        let msg = Message::Text(r#"{"op":"identify","d":{"token":"abc"}}"#.into());
        let frame = Connection::parse_message(msg)
            .expect("parse ok")
            .expect("frame present");
        assert!(matches!(frame, ClientFrame::Identify(_)));
    }

    #[test]
    fn parse_message_binary_heartbeat_returns_frame() {
        let msg = Message::Binary(br#"{"op":"heartbeat"}"#.to_vec().into());
        let frame = Connection::parse_message(msg)
            .expect("parse ok")
            .expect("frame present");
        assert!(matches!(frame, ClientFrame::Heartbeat));
    }

    #[test]
    fn parse_message_malformed_text_is_decode_error() {
        let msg = Message::Text("{not json".into());
        let err = Connection::parse_message(msg).expect_err("decode err");
        assert_eq!(err, CloseCode::DecodeError);
    }

    #[test]
    fn parse_message_ping_pong_are_ignored() {
        assert!(Connection::parse_message(Message::Ping(Vec::new().into()))
            .expect("parse ok")
            .is_none());
        assert!(Connection::parse_message(Message::Pong(Vec::new().into()))
            .expect("parse ok")
            .is_none());
    }

    #[test]
    fn parse_message_close_returns_internal() {
        let msg = Message::Close(None);
        let err = Connection::parse_message(msg).expect_err("close err");
        assert_eq!(err, CloseCode::Internal);
    }
}
