use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use dashmap::mapref::entry::Entry;
use dashmap::DashMap;
use jiff::Timestamp;
use ruma::{OwnedUserId, UserId};
use toasty::Db;
use tokio::task::JoinHandle;

use crate::presence::custom_status::{self as cs, CustomStatusData};
use crate::presence::fanout::{PresenceFanout, TryPushError};
use crate::presence::protocol::{
    Activity, ClientStatus, ClientType, Dispatch, Presence, ServerFrame, Status, UserPresence,
};
use crate::presence::ConnId;

struct CustomStatusEntry {
    data: CustomStatusData,
    expiry_timer: Option<JoinHandle<()>>,
}

struct PerConn {
    client_type: Option<ClientType>,
    presence: Presence,
}

struct UserSlot {
    conns: HashMap<ConnId, PerConn>,
    last_published: Option<UserPresence>,
    offline_grace: Option<JoinHandle<()>>,
}

impl UserSlot {
    fn new() -> Self {
        Self {
            conns: HashMap::new(),
            last_published: None,
            offline_grace: None,
        }
    }

    fn realize(&self, user_id: &UserId) -> UserPresence {
        if self.conns.is_empty() {
            return offline(user_id);
        }

        let status = self
            .conns
            .values()
            .map(|c| c.presence.status)
            .max_by_key(|s| status_rank(*s))
            .unwrap_or(Status::Offline);

        let activities = merge_activities(self.conns.values().map(|c| &c.presence.activities));
        let client_status = fold_client_status(self.conns.values());

        UserPresence {
            user_id: user_id.to_owned(),
            status,
            client_status,
            activities,
        }
    }
}

pub struct PresenceRegistry {
    users: DashMap<OwnedUserId, UserSlot>,
    fanout: Arc<PresenceFanout>,
    offline_grace: Duration,
    custom_status: DashMap<OwnedUserId, CustomStatusEntry>,
    db: Option<Db>,
}

impl PresenceRegistry {
    pub fn new(fanout: Arc<PresenceFanout>, offline_grace: Duration, db: Option<Db>) -> Arc<Self> {
        Arc::new(Self {
            users: DashMap::new(),
            fanout,
            offline_grace,
            custom_status: DashMap::new(),
            db,
        })
    }

    pub fn connect(&self, user_id: &UserId, conn_id: ConnId, client_type: Option<ClientType>) {
        let per_conn = PerConn {
            client_type,
            presence: default_presence(),
        };
        self.apply(user_id, |custom, slot, uid| {
            if let Some(prev) = slot.offline_grace.take() {
                prev.abort();
            }
            slot.conns.insert(conn_id, per_conn);
            let new = slot.realize(uid);
            published(slot, new, custom)
        });
    }

    pub fn update(&self, user_id: &UserId, conn_id: &ConnId, presence: Presence) {
        self.apply(user_id, |custom, slot, uid| {
            let per = slot.conns.get_mut(conn_id)?;
            per.presence = presence;
            let new = slot.realize(uid);
            published(slot, new, custom)
        });
    }

    /// Auto-Idle transition for a single conn. No-op unless that conn's
    /// per-conn presence is currently `Online`; Dnd/Invisible/Idle are
    /// explicit user choices and must not be overwritten by inactivity.
    pub fn auto_idle(&self, user_id: &UserId, conn_id: &ConnId) {
        self.apply(user_id, |custom, slot, uid| {
            let per = slot.conns.get_mut(conn_id)?;
            if per.presence.status != Status::Online {
                return None;
            }
            per.presence.status = Status::Idle;
            let new = slot.realize(uid);
            published(slot, new, custom)
        });
    }

    pub async fn hydrate_custom_status(self: &Arc<Self>, user_id: &UserId) {
        if self.custom_status.contains_key(user_id) {
            return;
        }
        let Some(db) = self.db.as_ref() else { return };
        let mut db = db.clone();
        match cs::load(&mut db, user_id).await {
            Ok(Some(data)) => {
                if let Some(deadline) = data.expires_at {
                    if deadline <= Timestamp::now() {
                        let _ = cs::delete(&mut db, user_id).await;
                        return;
                    }
                }
                self.install_custom_status(user_id, data);
            }
            Ok(None) => {}
            Err(err) => tracing::warn!(%user_id, ?err, "load custom_status failed"),
        }
    }

    pub async fn set_custom_status(self: &Arc<Self>, user_id: &UserId, data: CustomStatusData) {
        if let Some(db) = self.db.as_ref() {
            let mut db = db.clone();
            if let Err(err) = cs::upsert(&mut db, user_id, &data).await {
                tracing::warn!(%user_id, ?err, "upsert custom_status failed; cache still updated");
            }
        }
        self.install_custom_status(user_id, data);
        self.republish(user_id);
    }

    pub async fn clear_custom_status(self: &Arc<Self>, user_id: &UserId) {
        if let Some(db) = self.db.as_ref() {
            let mut db = db.clone();
            if let Err(err) = cs::delete(&mut db, user_id).await {
                tracing::warn!(%user_id, ?err, "delete custom_status failed");
            }
        }
        if let Some((_, mut entry)) = self.custom_status.remove(user_id) {
            if let Some(t) = entry.expiry_timer.take() {
                t.abort();
            }
        }
        self.republish(user_id);
    }

    fn install_custom_status(self: &Arc<Self>, user_id: &UserId, data: CustomStatusData) {
        let expiry_timer = data.expires_at.and_then(|deadline| {
            let now = Timestamp::now();
            if deadline <= now {
                return None;
            }
            let nanos = deadline.duration_since(now).as_nanos();
            let dur = u64::try_from(nanos).map_or(Duration::ZERO, Duration::from_nanos);
            let registry = Arc::clone(self);
            let target = user_id.to_owned();
            Some(tokio::spawn(async move {
                tokio::time::sleep(dur).await;
                registry.expire_custom_status(&target).await;
            }))
        });

        let entry = CustomStatusEntry { data, expiry_timer };
        if let Some(mut prev) = self.custom_status.insert(user_id.to_owned(), entry) {
            if let Some(t) = prev.expiry_timer.take() {
                t.abort();
            }
        }
    }

    async fn expire_custom_status(self: Arc<Self>, user_id: &UserId) {
        self.clear_custom_status(user_id).await;
    }

    fn republish(self: &Arc<Self>, user_id: &UserId) {
        self.apply(user_id, |custom, slot, uid| {
            if slot.conns.is_empty() {
                return None;
            }
            let new = slot.realize(uid);
            published(slot, new, custom)
        });
    }

    #[cfg(test)]
    pub fn users_len(&self) -> usize {
        self.users.len()
    }

    /// Build a presence snapshot intended for `viewer`. Only users in `members`
    /// are considered. Invisible users are omitted for everyone except `viewer`
    /// (who sees their own true state). Offline-effective users are omitted
    /// entirely — the client assumes Offline-by-absence.
    pub fn snapshot_for_members(
        &self,
        members: &HashSet<OwnedUserId>,
        viewer: &UserId,
    ) -> Vec<UserPresence> {
        let mut out = Vec::with_capacity(members.len().min(self.users.len()));
        for entry in &self.users {
            let user = entry.key();
            if !members.contains(user) {
                continue;
            }
            let Some(presence) = entry.value().last_published.clone() else {
                continue;
            };
            let is_self = user == viewer;
            let visible = match presence.status {
                Status::Offline => false,
                Status::Invisible => is_self,
                _ => true,
            };
            if visible {
                out.push(presence);
            }
        }
        out
    }

    pub fn disconnect(self: &Arc<Self>, user_id: &UserId, conn_id: &ConnId) {
        let owned = user_id.to_owned();
        let custom = self.custom_activity_for(user_id);
        let mut entry = match self.users.entry(owned.clone()) {
            Entry::Occupied(occ) => occ,
            Entry::Vacant(_) => return,
        };

        let slot = entry.get_mut();
        slot.conns.remove(conn_id);

        if slot.conns.is_empty() {
            if let Some(prev) = slot.offline_grace.take() {
                prev.abort();
            }
            let registry = Arc::clone(self);
            let target = owned;
            let grace = self.offline_grace;
            let handle = tokio::spawn(async move {
                tokio::time::sleep(grace).await;
                registry.finalize_offline(&target);
            });
            slot.offline_grace = Some(handle);
            return;
        }

        let result = {
            let new = slot.realize(user_id);
            published(slot, new, custom.as_ref())
        };
        drop(entry);

        if let Some((effective, self_conns)) = result {
            self.dispatch(user_id, effective, &self_conns);
        }
    }

    fn finalize_offline(&self, user_id: &OwnedUserId) {
        let off = offline(user_id);
        let changed = {
            let mut entry = match self.users.entry(user_id.clone()) {
                Entry::Occupied(occ) => occ,
                Entry::Vacant(_) => return,
            };

            let slot = entry.get_mut();
            if !slot.conns.is_empty() {
                return;
            }

            let changed = slot.last_published.as_ref() != Some(&off);
            slot.offline_grace = None;
            entry.remove();
            changed
        };

        if changed {
            self.dispatch(user_id, off, &[]);
        }
    }

    fn apply<F>(&self, user_id: &UserId, f: F)
    where
        F: FnOnce(Option<&Activity>, &mut UserSlot, &UserId) -> Option<(UserPresence, Vec<ConnId>)>,
    {
        let custom = self.custom_activity_for(user_id);
        let result = {
            let mut entry = self
                .users
                .entry(user_id.to_owned())
                .or_insert_with(UserSlot::new);
            f(custom.as_ref(), entry.value_mut(), user_id)
        };

        if let Some((effective, self_conns)) = result {
            self.dispatch(user_id, effective, &self_conns);
        }
    }

    /// Materialize the user's current custom status into a synthetic
    /// outbound `Activity`, applying expiry against `now`. Returns `None`
    /// if the user has no custom status or it's expired.
    fn custom_activity_for(&self, user_id: &UserId) -> Option<Activity> {
        let entry = self.custom_status.get(user_id)?;
        entry.data.to_activity(Timestamp::now())
    }

    fn dispatch(&self, user_id: &UserId, effective: UserPresence, self_conns: &[ConnId]) {
        self.fanout.publish(user_id.to_owned(), effective.clone());

        let frame = ServerFrame::Dispatch(Dispatch::PresenceUpdate(effective));
        for cid in self_conns {
            if let Err(err) = self.fanout.try_push_to(cid, frame.clone()) {
                match err {
                    TryPushError::Full => {
                        tracing::debug!(conn = cid.as_str(), "self-echo sink full; dropping");
                    }
                    TryPushError::Closed | TryPushError::Unknown => {}
                }
            }
        }
    }
}

fn published(
    slot: &mut UserSlot,
    mut new: UserPresence,
    custom: Option<&Activity>,
) -> Option<(UserPresence, Vec<ConnId>)> {
    if new.status != Status::Offline {
        if let Some(act) = custom {
            new.activities
                .retain(|a| a.kind != crate::presence::protocol::ActivityKind::Custom);
            new.activities.insert(0, act.clone());
        }
    }

    if slot.last_published.as_ref() == Some(&new) {
        return None;
    }
    slot.last_published = Some(new.clone());
    let self_conns = slot.conns.keys().cloned().collect();
    Some((new, self_conns))
}

const fn default_presence() -> Presence {
    Presence {
        status: Status::Online,
        activities: Vec::new(),
        afk: false,
        since: None,
    }
}

fn offline(user_id: &UserId) -> UserPresence {
    UserPresence {
        user_id: user_id.to_owned(),
        status: Status::Offline,
        client_status: ClientStatus::default(),
        activities: Vec::new(),
    }
}

const fn status_rank(s: Status) -> u8 {
    match s {
        Status::Online => 4,
        Status::Idle => 3,
        Status::Dnd => 2,
        Status::Invisible => 1,
        Status::Offline => 0,
    }
}

fn merge_activities<'a, I>(per_conn_activities: I) -> Vec<Activity>
where
    I: Iterator<Item = &'a Vec<Activity>>,
{
    let mut out: Vec<Activity> = Vec::new();
    let mut seen: std::collections::HashSet<(Option<String>, u8, String)> =
        std::collections::HashSet::new();
    for activities in per_conn_activities {
        for act in activities {
            let key = (act.application_id.clone(), act.kind as u8, act.name.clone());
            if seen.insert(key) {
                out.push(act.clone());
            }
        }
    }
    out.sort_by(|a, b| {
        a.application_id
            .cmp(&b.application_id)
            .then_with(|| (a.kind as u8).cmp(&(b.kind as u8)))
            .then_with(|| a.name.cmp(&b.name))
    });
    out
}

fn fold_client_status<'a, I>(conns: I) -> ClientStatus
where
    I: Iterator<Item = &'a PerConn>,
{
    let mut by_type: HashMap<ClientType, Status> = HashMap::new();
    for conn in conns {
        let Some(ct) = conn.client_type else { continue };
        let s = conn.presence.status;
        by_type
            .entry(ct)
            .and_modify(|cur| {
                if status_rank(s) > status_rank(*cur) {
                    *cur = s;
                }
            })
            .or_insert(s);
    }
    ClientStatus {
        desktop: by_type.get(&ClientType::Desktop).copied(),
        mobile: by_type.get(&ClientType::Mobile).copied(),
        web: by_type.get(&ClientType::Web).copied(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matrix::{MatrixApi, MatrixError};
    use crate::membership::MembershipCache;
    use crate::presence::protocol::{
        Activity, ActivityKind, Dispatch, Presence, ServerFrame, Status,
    };
    use crate::presence::subscriptions::SubscriptionRegistry;
    use futures_util::future::BoxFuture;
    use ruma::{user_id, OwnedRoomId, OwnedUserId, RoomId};
    use std::time::Duration;
    use tokio::sync::mpsc;

    struct MockMatrix;

    impl MatrixApi for MockMatrix {
        fn joined_rooms<'a>(
            &'a self,
            _user: &'a UserId,
        ) -> BoxFuture<'a, Result<Vec<OwnedRoomId>, MatrixError>> {
            Box::pin(async move { Ok(vec![]) })
        }

        fn joined_members<'a>(
            &'a self,
            _room: &'a RoomId,
        ) -> BoxFuture<'a, Result<Vec<OwnedUserId>, MatrixError>> {
            Box::pin(async move { Ok(vec![]) })
        }
    }

    fn build() -> (Arc<PresenceFanout>, Arc<PresenceRegistry>) {
        build_with_grace(Duration::from_secs(30))
    }

    fn build_with_grace(grace: Duration) -> (Arc<PresenceFanout>, Arc<PresenceRegistry>) {
        let matrix = Arc::new(MockMatrix) as Arc<dyn MatrixApi>;
        let membership = MembershipCache::new(matrix, Duration::from_mins(1), 100, 100);
        let subs = Arc::new(SubscriptionRegistry::new());
        let fanout = PresenceFanout::new(membership, subs);
        let registry = PresenceRegistry::new(fanout.clone(), grace, None);
        (fanout, registry)
    }

    fn alice() -> OwnedUserId {
        user_id!("@alice:test.org").to_owned()
    }

    fn presence(status: Status) -> Presence {
        Presence {
            status,
            activities: vec![],
            afk: false,
            since: None,
        }
    }

    fn activity(name: &str, kind: ActivityKind, app_id: Option<&str>) -> Activity {
        Activity {
            name: name.into(),
            kind,
            url: None,
            created_at: None,
            expires_at: None,
            timestamps: None,
            application_id: app_id.map(Into::into),
            details: None,
            state: None,
            emoji: None,
            party: None,
            assets: None,
            secrets: None,
            instance: None,
            flags: 0,
            buttons: vec![],
        }
    }

    async fn recv_presence(rx: &mut mpsc::Receiver<ServerFrame>) -> UserPresence {
        let frame = tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("frame within timeout")
            .expect("channel open");
        let ServerFrame::Dispatch(Dispatch::PresenceUpdate(p)) = frame else {
            panic!("expected PresenceUpdate, got {frame:?}");
        };
        p
    }

    async fn expect_no_frame(rx: &mut mpsc::Receiver<ServerFrame>) {
        if let Ok(Some(frame)) = tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {
            panic!("unexpected frame: {frame:?}");
        }
    }

    async fn drain(rx: &mut mpsc::Receiver<ServerFrame>) {
        while tokio::time::timeout(Duration::from_millis(30), rx.recv())
            .await
            .is_ok()
        {}
    }

    #[tokio::test]
    async fn connect_self_echoes_default_online() {
        let (fanout, registry) = build();
        let c = ConnId::new("c1");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c, Some(ClientType::Desktop));

        let p = recv_presence(&mut rx).await;
        assert_eq!(p.status, Status::Online);
        assert_eq!(p.client_status.desktop, Some(Status::Online));
        assert_eq!(p.client_status.mobile, None);
        assert!(p.activities.is_empty());
    }

    #[tokio::test]
    async fn update_self_echoes_on_change() {
        let (fanout, registry) = build();
        let c = ConnId::new("c1");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.update(&alice(), &c, presence(Status::Dnd));
        let p = recv_presence(&mut rx).await;
        assert_eq!(p.status, Status::Dnd);
    }

    #[tokio::test]
    async fn dedup_blocks_identical_update() {
        let (fanout, registry) = build();
        let c = ConnId::new("c1");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        // Re-emit the same effective state (Online, no activities).
        registry.update(&alice(), &c, presence(Status::Online));
        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn multi_conn_status_priority() {
        let (fanout, registry) = build();
        let a = ConnId::new("a");
        let b = ConnId::new("b");
        let mut rx_a = fanout.register(a.clone());
        let mut rx_b = fanout.register(b.clone());

        registry.connect(&alice(), a.clone(), Some(ClientType::Desktop));
        registry.connect(&alice(), b.clone(), Some(ClientType::Mobile));
        // b update Dnd → effective Online (a wins), client_status.mobile flips.
        registry.update(&alice(), &b, presence(Status::Dnd));
        drain(&mut rx_a).await;
        drain(&mut rx_b).await;

        // a updates Idle → effective Idle (Idle > Dnd).
        registry.update(&alice(), &a, presence(Status::Idle));
        let pa = recv_presence(&mut rx_a).await;
        assert_eq!(pa.status, Status::Idle);
        let pb = recv_presence(&mut rx_b).await;
        assert_eq!(pb.status, Status::Idle);
    }

    #[tokio::test]
    async fn invisible_loses_to_active_device() {
        let (fanout, registry) = build();
        let laptop = ConnId::new("laptop");
        let phone = ConnId::new("phone");
        let mut rx_l = fanout.register(laptop.clone());
        let mut rx_p = fanout.register(phone.clone());

        registry.connect(&alice(), laptop.clone(), Some(ClientType::Desktop));
        registry.connect(&alice(), phone.clone(), Some(ClientType::Mobile));
        drain(&mut rx_l).await;
        drain(&mut rx_p).await;

        // Laptop → Invisible. Phone Online → effective status stays Online.
        // client_status.desktop changes Online → Invisible → echo fires.
        registry.update(&alice(), &laptop, presence(Status::Invisible));
        let p = recv_presence(&mut rx_l).await;
        assert_eq!(p.status, Status::Online, "Invisible loses to Online");
        assert_eq!(p.client_status.desktop, Some(Status::Invisible));
        assert_eq!(p.client_status.mobile, Some(Status::Online));
    }

    #[tokio::test]
    async fn invisible_alone_is_effective() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.update(&alice(), &c, presence(Status::Invisible));
        let p = recv_presence(&mut rx).await;
        // Self-echo carries real (unmasked) Invisible.
        assert_eq!(p.status, Status::Invisible);
    }

    #[tokio::test]
    async fn client_status_groups_by_type() {
        let (fanout, registry) = build();
        let d = ConnId::new("d");
        let m = ConnId::new("m");
        let w = ConnId::new("w");
        let mut rx = fanout.register(d.clone());
        let _rx_m = fanout.register(m.clone());
        let _rx_w = fanout.register(w.clone());

        registry.connect(&alice(), d.clone(), Some(ClientType::Desktop));
        registry.connect(&alice(), m.clone(), Some(ClientType::Mobile));
        registry.connect(&alice(), w.clone(), Some(ClientType::Web));
        registry.update(&alice(), &m, presence(Status::Dnd));
        drain(&mut rx).await;

        // Push m to Idle so client_status changes (Mobile: Dnd → Idle).
        // effective status: max(d=Online, m=Idle, w=Online) = Online → no status change.
        // client_status differs → echo.
        registry.update(&alice(), &m, presence(Status::Idle));
        let p = recv_presence(&mut rx).await;
        assert_eq!(p.status, Status::Online);
        assert_eq!(p.client_status.desktop, Some(Status::Online));
        assert_eq!(p.client_status.mobile, Some(Status::Idle));
        assert_eq!(p.client_status.web, Some(Status::Online));
    }

    #[tokio::test]
    async fn client_status_same_type_takes_highest() {
        let (fanout, registry) = build();
        let a = ConnId::new("a");
        let b = ConnId::new("b");
        let mut rx = fanout.register(a.clone());
        let _rx_b = fanout.register(b.clone());

        registry.connect(&alice(), a.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;
        registry.connect(&alice(), b.clone(), Some(ClientType::Desktop));
        // Both Desktop+Online → dedup.

        // b goes Idle → effective still Online (a) → dedup. But client_status.desktop
        // should be Online (highest among Desktops).
        registry.update(&alice(), &b, presence(Status::Idle));
        expect_no_frame(&mut rx).await;

        // a goes Dnd → effective Idle (b wins, Idle > Dnd). Desktop group: max(Dnd,Idle)=Idle.
        registry.update(&alice(), &a, presence(Status::Dnd));
        let p = recv_presence(&mut rx).await;
        assert_eq!(p.status, Status::Idle);
        assert_eq!(p.client_status.desktop, Some(Status::Idle));
    }

    #[tokio::test]
    async fn activities_union_dedup() {
        let (fanout, registry) = build();
        let a = ConnId::new("a");
        let b = ConnId::new("b");
        let mut rx = fanout.register(a.clone());
        let _rx_b = fanout.register(b.clone());

        registry.connect(&alice(), a.clone(), Some(ClientType::Desktop));
        registry.connect(&alice(), b.clone(), Some(ClientType::Mobile));
        drain(&mut rx).await;

        let mut p_a = presence(Status::Online);
        p_a.activities
            .push(activity("Halo", ActivityKind::Playing, Some("game-1")));
        p_a.activities
            .push(activity("Spotify", ActivityKind::Listening, Some("spot")));
        registry.update(&alice(), &a, p_a);
        let out = recv_presence(&mut rx).await;
        assert_eq!(out.activities.len(), 2);

        let mut p_b = presence(Status::Online);
        p_b.activities
            .push(activity("Spotify", ActivityKind::Listening, Some("spot")));
        p_b.activities
            .push(activity("vibing", ActivityKind::Custom, None));
        registry.update(&alice(), &b, p_b);

        let out = recv_presence(&mut rx).await;
        assert_eq!(out.activities.len(), 3);
        let names: Vec<&str> = out.activities.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"Halo"));
        assert!(names.contains(&"Spotify"));
        assert!(names.contains(&"vibing"));
    }

    #[tokio::test]
    async fn disconnect_recomputes_effective() {
        let (fanout, registry) = build();
        let a = ConnId::new("a");
        let b = ConnId::new("b");
        let mut rx_a = fanout.register(a.clone());
        let mut rx_b = fanout.register(b.clone());

        registry.connect(&alice(), a.clone(), Some(ClientType::Desktop));
        registry.connect(&alice(), b.clone(), Some(ClientType::Mobile));
        registry.update(&alice(), &b, presence(Status::Dnd));
        drain(&mut rx_a).await;
        drain(&mut rx_b).await;

        registry.disconnect(&alice(), &a);
        fanout.unregister(&a);
        let p = recv_presence(&mut rx_b).await;
        assert_eq!(p.status, Status::Dnd);
        expect_no_frame(&mut rx_a).await;
    }

    #[tokio::test]
    async fn last_disconnect_starts_grace_then_evicts() {
        let grace = Duration::from_millis(30);
        let (fanout, registry) = build_with_grace(grace);
        let c = ConnId::new("only");
        let _rx = fanout.register(c.clone());
        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        assert_eq!(registry.users_len(), 1);

        registry.disconnect(&alice(), &c);
        // Slot persists during grace.
        assert_eq!(registry.users_len(), 1);

        tokio::time::sleep(grace * 3).await;
        assert_eq!(registry.users_len(), 0);
    }

    fn bob() -> OwnedUserId {
        user_id!("@bob:test.org").to_owned()
    }

    fn carol() -> OwnedUserId {
        user_id!("@carol:test.org").to_owned()
    }

    #[tokio::test]
    async fn snapshot_for_members_filters_by_membership() {
        let (fanout, registry) = build();
        let ca = ConnId::new("ca");
        let cb = ConnId::new("cb");
        let _rxa = fanout.register(ca.clone());
        let _rxb = fanout.register(cb.clone());

        registry.connect(&alice(), ca, Some(ClientType::Desktop));
        registry.connect(&bob(), cb, Some(ClientType::Desktop));

        let members: HashSet<_> = std::iter::once(alice()).collect();
        let snap = registry.snapshot_for_members(&members, &carol());
        let user_ids: Vec<_> = snap.iter().map(|p| p.user_id.clone()).collect();
        assert_eq!(user_ids, vec![alice()]);
    }

    #[tokio::test]
    async fn snapshot_omits_offline() {
        let grace = Duration::from_millis(30);
        let (fanout, registry) = build_with_grace(grace);
        let ca = ConnId::new("ca");
        let _rxa = fanout.register(ca.clone());
        registry.connect(&alice(), ca.clone(), Some(ClientType::Desktop));
        registry.disconnect(&alice(), &ca);

        tokio::time::sleep(grace * 3).await;

        let members: HashSet<_> = std::iter::once(alice()).collect();
        let snap = registry.snapshot_for_members(&members, &carol());
        assert!(snap.is_empty(), "evicted slot must not appear in snapshot");
    }

    #[tokio::test]
    async fn snapshot_hides_invisible_from_others_but_shows_to_self() {
        let (fanout, registry) = build();
        let ca = ConnId::new("ca");
        let _rxa = fanout.register(ca.clone());
        registry.connect(&alice(), ca.clone(), Some(ClientType::Desktop));
        registry.update(&alice(), &ca, presence(Status::Invisible));

        let members: HashSet<_> = std::iter::once(alice()).collect();

        let snap_other = registry.snapshot_for_members(&members, &bob());
        assert!(
            snap_other.is_empty(),
            "alice invisible must not appear for bob"
        );

        let snap_self = registry.snapshot_for_members(&members, &alice());
        assert_eq!(snap_self.len(), 1);
        assert_eq!(snap_self[0].status, Status::Invisible);
    }

    #[tokio::test]
    async fn offline_grace_suppresses_immediate_offline() {
        let grace = Duration::from_millis(100);
        let (fanout, registry) = build_with_grace(grace);
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.disconnect(&alice(), &c);
        // No frame in fanout yet — grace pending.
        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn reconnect_during_grace_cancels_offline() {
        let grace = Duration::from_millis(60);
        let (fanout, registry) = build_with_grace(grace);
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.disconnect(&alice(), &c);
        assert_eq!(registry.users_len(), 1);

        tokio::time::sleep(grace / 2).await;
        assert_eq!(registry.users_len(), 1, "still graced");

        let c2 = ConnId::new("c2");
        let _rx2 = fanout.register(c2.clone());
        registry.connect(&alice(), c2.clone(), Some(ClientType::Desktop));

        // Past original grace deadline. Slot must NOT be evicted.
        tokio::time::sleep(grace * 2).await;
        assert_eq!(registry.users_len(), 1, "reconnect cancels grace");
    }

    #[tokio::test]
    async fn auto_idle_flips_online_to_idle() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.auto_idle(&alice(), &c);
        let p = recv_presence(&mut rx).await;
        assert_eq!(p.status, Status::Idle);
        assert_eq!(p.client_status.desktop, Some(Status::Idle));
    }

    #[tokio::test]
    async fn auto_idle_preserves_dnd() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        registry.update(&alice(), &c, presence(Status::Dnd));
        drain(&mut rx).await;

        registry.auto_idle(&alice(), &c);
        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn auto_idle_preserves_invisible() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        registry.update(&alice(), &c, presence(Status::Invisible));
        drain(&mut rx).await;

        registry.auto_idle(&alice(), &c);
        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn auto_idle_preserves_activities() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());

        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        let mut p = presence(Status::Online);
        p.activities
            .push(activity("Halo", ActivityKind::Playing, Some("g")));
        registry.update(&alice(), &c, p);
        drain(&mut rx).await;

        registry.auto_idle(&alice(), &c);
        let out = recv_presence(&mut rx).await;
        assert_eq!(out.status, Status::Idle);
        assert_eq!(out.activities.len(), 1);
        assert_eq!(out.activities[0].name, "Halo");
    }

    #[tokio::test]
    async fn auto_idle_unknown_conn_is_noop() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        drain(&mut rx).await;

        registry.auto_idle(&alice(), &ConnId::new("ghost"));
        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn snapshot_dedupes_users_in_member_set() {
        let (fanout, registry) = build();
        let ca = ConnId::new("ca");
        let _rxa = fanout.register(ca.clone());
        registry.connect(&alice(), ca, Some(ClientType::Desktop));

        // Even if alice is "in" two notional spaces, the snapshot is keyed by
        // user via the registry scan, so she appears exactly once.
        let members: HashSet<_> = std::iter::once(alice()).collect();
        let snap = registry.snapshot_for_members(&members, &carol());
        assert_eq!(snap.len(), 1);
    }

    fn custom(text: &str) -> CustomStatusData {
        CustomStatusData {
            emoji_name: None,
            emoji_id: None,
            emoji_animated: false,
            text: Some(text.into()),
            expires_at: None,
        }
    }

    #[tokio::test]
    async fn set_custom_status_prepends_synthetic_activity() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c, Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.set_custom_status(&alice(), custom("vibing")).await;

        let p = recv_presence(&mut rx).await;
        assert_eq!(p.activities.len(), 1);
        assert_eq!(p.activities[0].kind, ActivityKind::Custom);
        assert_eq!(p.activities[0].name, "vibing");
    }

    #[tokio::test]
    async fn clear_custom_status_removes_it() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c, Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.set_custom_status(&alice(), custom("vibing")).await;
        drain(&mut rx).await;

        registry.clear_custom_status(&alice()).await;
        let p = recv_presence(&mut rx).await;
        assert!(p.activities.iter().all(|a| a.kind != ActivityKind::Custom));
    }

    #[tokio::test]
    async fn custom_status_replaces_prior_value() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c, Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        registry.set_custom_status(&alice(), custom("first")).await;
        drain(&mut rx).await;

        registry.set_custom_status(&alice(), custom("second")).await;
        let p = recv_presence(&mut rx).await;
        let custom_acts: Vec<_> = p
            .activities
            .iter()
            .filter(|a| a.kind == ActivityKind::Custom)
            .collect();
        assert_eq!(custom_acts.len(), 1);
        assert_eq!(custom_acts[0].name, "second");
    }

    #[tokio::test]
    async fn custom_status_dropped_when_offline() {
        let (fanout, registry) = build_with_grace(Duration::from_millis(20));
        let c = ConnId::new("c");
        let _rx = fanout.register(c.clone());
        registry.connect(&alice(), c.clone(), Some(ClientType::Desktop));
        registry.set_custom_status(&alice(), custom("vibing")).await;
        registry.disconnect(&alice(), &c);

        tokio::time::sleep(Duration::from_millis(80)).await;

        let members: HashSet<_> = std::iter::once(alice()).collect();
        let snap = registry.snapshot_for_members(&members, &alice());
        assert!(snap.is_empty(), "offline user must not appear in snapshot");
    }

    #[tokio::test]
    async fn custom_status_with_past_expiry_is_filtered() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c, Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        let past = Timestamp::now() - jiff::Span::new().seconds(60);
        let mut data = custom("expired");
        data.expires_at = Some(past);
        registry.set_custom_status(&alice(), data).await;

        expect_no_frame(&mut rx).await;
    }

    #[tokio::test]
    async fn custom_status_expiry_timer_fires_and_clears() {
        let (fanout, registry) = build();
        let c = ConnId::new("c");
        let mut rx = fanout.register(c.clone());
        registry.connect(&alice(), c, Some(ClientType::Desktop));
        let _ = recv_presence(&mut rx).await;

        let deadline = Timestamp::now() + jiff::Span::new().milliseconds(60);
        let mut data = custom("brief");
        data.expires_at = Some(deadline);
        registry.set_custom_status(&alice(), data).await;
        let p = recv_presence(&mut rx).await;
        assert_eq!(p.activities[0].name, "brief");

        let after = recv_presence(&mut rx).await;
        assert!(after
            .activities
            .iter()
            .all(|a| a.kind != ActivityKind::Custom));
    }

    #[tokio::test]
    async fn hydrate_is_noop_without_db() {
        let (_fanout, registry) = build();
        registry.hydrate_custom_status(&alice()).await;
        assert!(registry.custom_status.get(&alice()).is_none());
    }
}
