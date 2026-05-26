#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use parking_lot::Mutex;
use ruma::{OwnedUserId, UserId};
use tokio::sync::{mpsc, Notify};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::membership::MembershipCache;
use crate::presence::protocol::{Dispatch, ServerFrame, Status, UserPresence};
use crate::presence::subscriptions::SubscriptionRegistry;
use crate::presence::ConnId;

const SINK_BUFFER: usize = 32;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Default)]
struct Queue {
    pending: Mutex<HashMap<OwnedUserId, UserPresence>>,
    notify: Notify,
}

pub struct PresenceFanout {
    sinks: Arc<DashMap<ConnId, mpsc::Sender<ServerFrame>>>,
    queue: Arc<Queue>,
    shutdown: CancellationToken,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl PresenceFanout {
    pub fn new(membership: MembershipCache, subscriptions: Arc<SubscriptionRegistry>) -> Arc<Self> {
        let sinks: Arc<DashMap<ConnId, mpsc::Sender<ServerFrame>>> = Arc::new(DashMap::new());
        let queue = Arc::new(Queue::default());
        let shutdown = CancellationToken::new();

        let worker = spawn_worker(
            queue.clone(),
            sinks.clone(),
            membership,
            subscriptions,
            shutdown.clone(),
        );

        Arc::new(Self {
            sinks,
            queue,
            shutdown,
            worker: Mutex::new(Some(worker)),
        })
    }

    /// Register a connection sink. Returns the receiver the conn task drives onto its WS.
    pub fn register(&self, conn_id: ConnId) -> mpsc::Receiver<ServerFrame> {
        let (tx, rx) = mpsc::channel(SINK_BUFFER);
        self.sinks.insert(conn_id, tx);
        rx
    }

    /// Remove a sink. Call this BEFORE `SubscriptionRegistry::cleanup` on disconnect
    /// so in-flight fanout work can't push to a half-torn-down conn.
    pub fn unregister(&self, conn_id: &ConnId) {
        self.sinks.remove(conn_id);
    }

    /// Queue a presence update for fanout. Invisible status is masked to Offline
    /// (with activities cleared) at this boundary — fanout reaches strangers only.
    pub fn publish(&self, user_id: OwnedUserId, mut presence: UserPresence) {
        if presence.status == Status::Invisible {
            presence.status = Status::Offline;
            presence.activities.clear();
        }
        self.queue.pending.lock().insert(user_id, presence);
        self.queue.notify.notify_one();
    }

    /// Direct send to one connection. Used for Subscribed snapshots — must not drop
    /// under buffer pressure (uses `send().await`).
    pub async fn push_to(&self, conn_id: &ConnId, frame: ServerFrame) -> Result<(), PushError> {
        let tx = {
            let entry = self.sinks.get(conn_id).ok_or(PushError::Unknown)?;
            entry.clone()
        };
        tx.send(frame).await.map_err(|_| PushError::Closed)
    }

    /// Non-blocking direct send. Used for presence self-echo — a single slow client
    /// must not stall the registry update path. Drop on Full is acceptable; the
    /// client will resync on the next state change.
    pub fn try_push_to(&self, conn_id: &ConnId, frame: ServerFrame) -> Result<(), TryPushError> {
        let entry = self.sinks.get(conn_id).ok_or(TryPushError::Unknown)?;
        entry.try_send(frame).map_err(|e| match e {
            mpsc::error::TrySendError::Full(_) => TryPushError::Full,
            mpsc::error::TrySendError::Closed(_) => TryPushError::Closed,
        })
    }

    pub async fn shutdown(&self) {
        self.shutdown.cancel();
        let handle = self.worker.lock().take();
        if let Some(handle) = handle {
            let _ = tokio::time::timeout(SHUTDOWN_TIMEOUT, handle).await;
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PushError {
    #[error("conn not registered")]
    Unknown,
    #[error("conn sink closed")]
    Closed,
}

#[derive(Debug, thiserror::Error)]
pub enum TryPushError {
    #[error("conn not registered")]
    Unknown,
    #[error("conn sink full")]
    Full,
    #[error("conn sink closed")]
    Closed,
}

fn spawn_worker(
    queue: Arc<Queue>,
    sinks: Arc<DashMap<ConnId, mpsc::Sender<ServerFrame>>>,
    membership: MembershipCache,
    subscriptions: Arc<SubscriptionRegistry>,
    shutdown: CancellationToken,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::select! {
                () = queue.notify.notified() => {
                    drain(&queue, &sinks, &membership, &subscriptions).await;
                }
                () = shutdown.cancelled() => {
                    drain(&queue, &sinks, &membership, &subscriptions).await;
                    break;
                }
            }
        }
    })
}

async fn drain(
    queue: &Queue,
    sinks: &DashMap<ConnId, mpsc::Sender<ServerFrame>>,
    membership: &MembershipCache,
    subscriptions: &SubscriptionRegistry,
) {
    let drained: Vec<(OwnedUserId, UserPresence)> = {
        let mut pending = queue.pending.lock();
        pending.drain().collect()
    };

    for (user_id, presence) in drained {
        fanout_one(&user_id, presence, sinks, membership, subscriptions).await;
    }
}

async fn fanout_one(
    user_id: &UserId,
    presence: UserPresence,
    sinks: &DashMap<ConnId, mpsc::Sender<ServerFrame>>,
    membership: &MembershipCache,
    subscriptions: &SubscriptionRegistry,
) {
    let spaces = match membership.spaces_of(user_id).await {
        Ok(spaces) => spaces,
        Err(err) => {
            tracing::warn!(%user_id, ?err, "spaces_of failed; dropping fanout job");
            return;
        }
    };

    if spaces.is_empty() {
        return;
    }

    let frame = ServerFrame::Dispatch(Dispatch::PresenceUpdate(presence));

    for room in spaces.iter() {
        for conn_id in subscriptions.subscribers(room) {
            let Some(sink) = sinks.get(&conn_id) else {
                continue;
            };
            if sink.try_send(frame.clone()).is_err() {
                tracing::debug!(
                    conn = conn_id.as_str(),
                    %room,
                    "fanout sink full or closed; dropping event"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matrix::{MatrixApi, MatrixError};
    use crate::presence::protocol::{ClientStatus, Status, UserPresence};
    use futures_util::future::BoxFuture;
    use ruma::{room_id, user_id, OwnedRoomId, RoomId};
    use std::sync::atomic::{AtomicBool, Ordering};

    struct MockMatrix {
        spaces: Vec<OwnedRoomId>,
        fail_spaces: AtomicBool,
    }

    impl MockMatrix {
        fn new(spaces: Vec<OwnedRoomId>) -> Self {
            Self {
                spaces,
                fail_spaces: AtomicBool::new(false),
            }
        }

        fn set_fail(&self, fail: bool) {
            self.fail_spaces.store(fail, Ordering::SeqCst);
        }
    }

    impl MatrixApi for MockMatrix {
        fn joined_rooms<'a>(
            &'a self,
            _user: &'a UserId,
        ) -> BoxFuture<'a, Result<Vec<OwnedRoomId>, MatrixError>> {
            Box::pin(async move {
                if self.fail_spaces.load(Ordering::SeqCst) {
                    Err(MatrixError::Transport("simulated".into()))
                } else {
                    Ok(self.spaces.clone())
                }
            })
        }

        fn joined_members<'a>(
            &'a self,
            _room: &'a RoomId,
        ) -> BoxFuture<'a, Result<Vec<OwnedUserId>, MatrixError>> {
            Box::pin(async move { Ok(vec![]) })
        }
    }

    fn build(
        spaces: Vec<OwnedRoomId>,
    ) -> (
        Arc<MockMatrix>,
        Arc<SubscriptionRegistry>,
        Arc<PresenceFanout>,
    ) {
        let matrix = Arc::new(MockMatrix::new(spaces));
        let membership = MembershipCache::new(
            matrix.clone() as Arc<dyn MatrixApi>,
            Duration::from_mins(1),
            100,
            100,
        );
        let subs = Arc::new(SubscriptionRegistry::new());
        let fanout = PresenceFanout::new(membership, subs.clone());
        (matrix, subs, fanout)
    }

    fn presence(status: Status) -> UserPresence {
        UserPresence {
            user_id: user_id!("@alice:test.org").to_owned(),
            status,
            client_status: ClientStatus::default(),
            activities: vec![],
        }
    }

    async fn wait_until_drained(fanout: &PresenceFanout) {
        for _ in 0..100 {
            if fanout.queue.pending.lock().is_empty() {
                return;
            }
            tokio::task::yield_now().await;
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        panic!("worker did not drain pending queue");
    }

    #[tokio::test]
    async fn publish_fans_to_subscribers_of_shared_space() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c_sub = ConnId::new("sub");
        let mut rx_sub = fanout.register(c_sub.clone());
        subs.subscribe(c_sub.clone(), r1.clone());

        let c_other = ConnId::new("other");
        let mut rx_other = fanout.register(c_other);

        fanout.publish(
            user_id!("@alice:test.org").to_owned(),
            presence(Status::Online),
        );

        let frame = tokio::time::timeout(Duration::from_millis(200), rx_sub.recv())
            .await
            .expect("subscriber should receive within timeout")
            .expect("frame");
        assert!(matches!(
            frame,
            ServerFrame::Dispatch(Dispatch::PresenceUpdate(_))
        ));

        // Non-subscriber must not receive.
        assert!(
            tokio::time::timeout(Duration::from_millis(50), rx_other.recv())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn invisible_status_masked_to_offline() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        subs.subscribe(c, r1);

        let mut p = presence(Status::Invisible);
        p.activities.push(crate::presence::protocol::Activity {
            name: "secret".into(),
            kind: crate::presence::protocol::ActivityKind::Playing,
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
            buttons: vec![],
        });
        fanout.publish(user_id!("@alice:test.org").to_owned(), p);

        let frame = tokio::time::timeout(Duration::from_millis(200), rx.recv())
            .await
            .expect("recv within timeout")
            .expect("channel open");
        let ServerFrame::Dispatch(Dispatch::PresenceUpdate(out)) = frame else {
            panic!("expected PresenceUpdate");
        };
        assert_eq!(out.status, Status::Offline);
        assert!(out.activities.is_empty(), "invisible must clear activities");
    }

    #[tokio::test]
    async fn coalesce_collapses_burst_to_last_write() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        subs.subscribe(c, r1);

        // Three rapid publishes for the same user before the worker can wake.
        // Synchronous insert+notify; worker is in select awaiting notify and
        // will only run once we yield.
        let u = user_id!("@alice:test.org").to_owned();
        fanout.publish(u.clone(), presence(Status::Online));
        fanout.publish(u.clone(), presence(Status::Idle));
        fanout.publish(u.clone(), presence(Status::Dnd));

        wait_until_drained(&fanout).await;

        let frame = tokio::time::timeout(Duration::from_millis(200), rx.recv())
            .await
            .expect("recv within timeout")
            .expect("channel open");
        let ServerFrame::Dispatch(Dispatch::PresenceUpdate(out)) = frame else {
            panic!();
        };
        assert_eq!(out.status, Status::Dnd, "last write wins");

        // Exactly one frame delivered.
        assert!(
            tokio::time::timeout(Duration::from_millis(50), rx.recv())
                .await
                .is_err(),
            "no further frames expected"
        );
    }

    #[tokio::test]
    async fn spaces_of_error_drops_job_without_panic() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (mock, subs, fanout) = build(vec![r1.clone()]);
        mock.set_fail(true);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        subs.subscribe(c, r1);

        fanout.publish(
            user_id!("@alice:test.org").to_owned(),
            presence(Status::Online),
        );

        // No panic, no delivery.
        assert!(tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .is_err());
    }

    #[tokio::test]
    async fn sink_full_drops_event_without_crash() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c = ConnId::new("c");
        let _rx = fanout.register(c.clone()); // hold receiver but never drain
        subs.subscribe(c, r1);

        // Publish to many distinct users → many distinct fanout events to same conn.
        for i in 0..(SINK_BUFFER * 2) {
            let user: OwnedUserId = format!("@u{i}:test.org").parse().expect("valid mxid");
            fanout.publish(
                user.clone(),
                UserPresence {
                    user_id: user,
                    status: Status::Online,
                    client_status: ClientStatus::default(),
                    activities: vec![],
                },
            );
        }

        wait_until_drained(&fanout).await;
        // Overflow events were dropped silently; no panic = pass.
    }

    #[tokio::test]
    async fn push_to_delivers_directly() {
        let (_m, _subs, fanout) = build(vec![]);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        let frame = ServerFrame::HeartbeatAck;
        fanout.push_to(&c, frame).await.expect("push_to ok");

        let received = tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv within timeout")
            .expect("channel open");
        assert!(matches!(received, ServerFrame::HeartbeatAck));
    }

    #[tokio::test]
    async fn push_to_unknown_conn_errors() {
        let (_m, _subs, fanout) = build(vec![]);
        let err = fanout
            .push_to(&ConnId::new("ghost"), ServerFrame::HeartbeatAck)
            .await;
        assert!(matches!(err, Err(PushError::Unknown)));
    }

    #[tokio::test]
    async fn unregister_stops_future_delivery() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        subs.subscribe(c.clone(), r1);

        fanout.unregister(&c);
        fanout.publish(
            user_id!("@alice:test.org").to_owned(),
            presence(Status::Online),
        );

        // Unregister drops the sender; rx may either close (None) or never wake
        // (timeout). Both signal "no delivery".
        match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
            Ok(None) | Err(_) => {}
            Ok(Some(_)) => panic!("should not receive after unregister"),
        }
    }

    #[tokio::test]
    async fn shutdown_drains_pending_then_exits() {
        let r1 = room_id!("!r1:test.org").to_owned();
        let (_m, subs, fanout) = build(vec![r1.clone()]);

        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        subs.subscribe(c, r1);

        fanout.publish(
            user_id!("@alice:test.org").to_owned(),
            presence(Status::Online),
        );
        fanout.shutdown().await;

        let frame = tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv within timeout")
            .expect("channel open");
        assert!(matches!(
            frame,
            ServerFrame::Dispatch(Dispatch::PresenceUpdate(_))
        ));
    }
}
