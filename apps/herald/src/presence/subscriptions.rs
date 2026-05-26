#![allow(dead_code)]

use std::collections::{HashMap, HashSet};

use parking_lot::RwLock;
use ruma::{OwnedRoomId, RoomId};

use crate::presence::ConnId;

#[derive(Default)]
struct Inner {
    by_room: HashMap<OwnedRoomId, HashSet<ConnId>>,
    by_conn: HashMap<ConnId, HashSet<OwnedRoomId>>,
}

#[derive(Default)]
pub struct SubscriptionRegistry {
    inner: RwLock<Inner>,
}

impl SubscriptionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, conn: ConnId, room: OwnedRoomId) {
        let mut state = self.inner.write();
        state
            .by_conn
            .entry(conn.clone())
            .or_default()
            .insert(room.clone());
        state.by_room.entry(room).or_default().insert(conn);
    }

    /// Batched subscribe. Returns the subset of `rooms` that were newly added
    /// (i.e. not already in this conn's subscription set). Single write-lock
    /// acquisition for the whole batch.
    pub fn subscribe_many(&self, conn: &ConnId, rooms: Vec<OwnedRoomId>) -> Vec<OwnedRoomId> {
        let mut state = self.inner.write();
        let mut newly = Vec::with_capacity(rooms.len());
        for room in rooms {
            let inserted_conn = state
                .by_conn
                .entry(conn.clone())
                .or_default()
                .insert(room.clone());
            let inserted_room = state
                .by_room
                .entry(room.clone())
                .or_default()
                .insert(conn.clone());
            debug_assert_eq!(inserted_conn, inserted_room, "bipartite registry desync");
            if inserted_conn {
                newly.push(room);
            }
        }
        drop(state);
        newly
    }

    /// Batched unsubscribe. Returns the subset of `rooms` that were actually
    /// removed (i.e. that this conn had subscribed). Prunes empty entries to
    /// preserve the bipartite-no-empty invariant.
    pub fn unsubscribe_many(&self, conn: &ConnId, rooms: Vec<OwnedRoomId>) -> Vec<OwnedRoomId> {
        let mut state = self.inner.write();
        let mut removed = Vec::with_capacity(rooms.len());
        for room in rooms {
            let was_in_conn = state
                .by_conn
                .get_mut(conn)
                .is_some_and(|set| set.remove(&room));
            let was_in_room = state
                .by_room
                .get_mut(&room)
                .is_some_and(|set| set.remove(conn));
            debug_assert_eq!(was_in_conn, was_in_room, "bipartite registry desync");

            if state.by_conn.get(conn).is_some_and(HashSet::is_empty) {
                state.by_conn.remove(conn);
            }
            if state.by_room.get(&room).is_some_and(HashSet::is_empty) {
                state.by_room.remove(&room);
            }

            if was_in_conn {
                removed.push(room);
            }
        }
        drop(state);
        removed
    }

    /// Current subscription count for a conn. Used for per-conn cap enforcement.
    pub fn conn_sub_count(&self, conn: &ConnId) -> usize {
        self.inner.read().by_conn.get(conn).map_or(0, HashSet::len)
    }

    pub fn unsubscribe(&self, conn: &ConnId, room: &RoomId) {
        let mut state = self.inner.write();

        let conn_now_empty = state.by_conn.get_mut(conn).is_some_and(|rooms| {
            rooms.remove(room);
            rooms.is_empty()
        });
        if conn_now_empty {
            state.by_conn.remove(conn);
        }

        let room_now_empty = state.by_room.get_mut(room).is_some_and(|conns| {
            conns.remove(conn);
            conns.is_empty()
        });
        if room_now_empty {
            state.by_room.remove(room);
        }
    }

    pub fn cleanup(&self, conn: &ConnId) {
        let mut state = self.inner.write();
        let Some(rooms) = state.by_conn.remove(conn) else {
            return;
        };
        for room in &rooms {
            let now_empty = state.by_room.get_mut(room).is_some_and(|conns| {
                conns.remove(conn);
                conns.is_empty()
            });
            if now_empty {
                state.by_room.remove(room);
            }
        }
    }

    pub fn subscribers(&self, room: &RoomId) -> Vec<ConnId> {
        let state = self.inner.read();
        state
            .by_room
            .get(room)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ruma::room_id;

    fn conn(id: &str) -> ConnId {
        ConnId::new(id)
    }

    fn assert_consistent(registry: &SubscriptionRegistry) {
        let state = registry.inner.read();
        for (conn, rooms) in &state.by_conn {
            for room in rooms {
                assert!(
                    state
                        .by_room
                        .get(room)
                        .is_some_and(|conns| conns.contains(conn)),
                    "by_conn has ({conn:?}, {room}) but by_room missing inverse"
                );
            }
        }
        for (room, conns) in &state.by_room {
            for conn in conns {
                assert!(
                    state
                        .by_conn
                        .get(conn)
                        .is_some_and(|rooms| rooms.contains(room)),
                    "by_room has ({room}, {conn:?}) but by_conn missing inverse"
                );
            }
            assert!(!conns.is_empty(), "by_room[{room}] is empty (leak)");
        }
        for (conn, rooms) in &state.by_conn {
            assert!(!rooms.is_empty(), "by_conn[{conn:?}] is empty (leak)");
        }
    }

    #[test]
    fn round_trip_subscribe_unsubscribe() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r = room_id!("!r1:example.org").to_owned();

        reg.subscribe(c.clone(), r.clone());
        assert_eq!(reg.subscribers(&r), vec![c.clone()]);

        reg.unsubscribe(&c, &r);
        assert!(reg.subscribers(&r).is_empty());
        assert_consistent(&reg);
    }

    #[test]
    fn bipartite_invariant_after_ops() {
        let reg = SubscriptionRegistry::new();
        let c1 = conn("c1");
        let c2 = conn("c2");
        let r1 = room_id!("!r1:example.org").to_owned();
        let r2 = room_id!("!r2:example.org").to_owned();

        reg.subscribe(c1.clone(), r1.clone());
        reg.subscribe(c1.clone(), r2);
        reg.subscribe(c2, r1.clone());
        assert_consistent(&reg);

        reg.unsubscribe(&c1, &r1);
        assert_consistent(&reg);
    }

    #[test]
    fn cleanup_removes_conn_from_all_rooms() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let other = conn("c2");
        let r1 = room_id!("!r1:example.org").to_owned();
        let r2 = room_id!("!r2:example.org").to_owned();
        let r3 = room_id!("!r3:example.org").to_owned();

        reg.subscribe(c.clone(), r1.clone());
        reg.subscribe(c.clone(), r2.clone());
        reg.subscribe(c.clone(), r3.clone());
        reg.subscribe(other.clone(), r1.clone());

        reg.cleanup(&c);

        assert_eq!(reg.subscribers(&r1), vec![other]);
        assert!(reg.subscribers(&r2).is_empty());
        assert!(reg.subscribers(&r3).is_empty());
        assert_consistent(&reg);
    }

    #[test]
    fn idempotent_ops() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r = room_id!("!r1:example.org").to_owned();

        reg.subscribe(c.clone(), r.clone());
        reg.subscribe(c.clone(), r.clone());
        assert_eq!(reg.subscribers(&r).len(), 1);

        reg.unsubscribe(&c, &r);
        reg.unsubscribe(&c, &r);
        assert!(reg.subscribers(&r).is_empty());

        reg.cleanup(&conn("never-existed"));
        assert_consistent(&reg);
    }

    #[test]
    fn empty_entries_pruned() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r = room_id!("!r1:example.org").to_owned();

        reg.subscribe(c.clone(), r.clone());
        reg.unsubscribe(&c, &r);

        let (room_empty, conn_empty) = {
            let state = reg.inner.read();
            (state.by_room.is_empty(), state.by_conn.is_empty())
        };
        assert!(room_empty, "by_room not pruned");
        assert!(conn_empty, "by_conn not pruned");
    }

    #[test]
    fn subscribe_many_returns_only_newly_added() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r1 = room_id!("!r1:example.org").to_owned();
        let r2 = room_id!("!r2:example.org").to_owned();
        let r3 = room_id!("!r3:example.org").to_owned();

        let added = reg.subscribe_many(&c, vec![r1.clone(), r2.clone()]);
        assert_eq!(added, vec![r1.clone(), r2.clone()]);

        // Re-subscribe with overlap: only r3 is new.
        let added2 = reg.subscribe_many(&c, vec![r1, r2, r3.clone()]);
        assert_eq!(added2, vec![r3]);
        assert_consistent(&reg);
    }

    #[test]
    fn subscribe_many_empty_input_is_noop() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let added = reg.subscribe_many(&c, vec![]);
        assert!(added.is_empty());
        assert_eq!(reg.conn_sub_count(&c), 0);
        assert_consistent(&reg);
    }

    #[test]
    fn unsubscribe_many_returns_only_actually_removed() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r1 = room_id!("!r1:example.org").to_owned();
        let r2 = room_id!("!r2:example.org").to_owned();
        let r3 = room_id!("!r3:example.org").to_owned();

        reg.subscribe_many(&c, vec![r1.clone(), r2.clone()]);

        // r3 was never subscribed → not in the diff.
        let removed = reg.unsubscribe_many(&c, vec![r1.clone(), r3]);
        assert_eq!(removed, vec![r1]);
        assert_eq!(reg.conn_sub_count(&c), 1);
        assert_consistent(&reg);

        let removed2 = reg.unsubscribe_many(&c, vec![r2.clone(), r2.clone()]);
        assert_eq!(removed2, vec![r2]);
        assert_eq!(reg.conn_sub_count(&c), 0);
        assert_consistent(&reg);
    }

    #[test]
    fn unsubscribe_many_prunes_empty_room_set_when_last_conn_leaves() {
        let reg = SubscriptionRegistry::new();
        let c1 = conn("c1");
        let c2 = conn("c2");
        let r = room_id!("!r1:example.org").to_owned();

        reg.subscribe_many(&c1, vec![r.clone()]);
        reg.subscribe_many(&c2, vec![r.clone()]);
        reg.unsubscribe_many(&c1, vec![r.clone()]);
        // r still has c2 → must not be pruned.
        assert_eq!(reg.subscribers(&r), vec![c2.clone()]);

        reg.unsubscribe_many(&c2, vec![r.clone()]);
        assert!(reg.subscribers(&r).is_empty());
        assert_consistent(&reg);
    }

    #[test]
    fn conn_sub_count_tracks_subscriptions() {
        let reg = SubscriptionRegistry::new();
        let c = conn("c1");
        let r1 = room_id!("!r1:example.org").to_owned();
        let r2 = room_id!("!r2:example.org").to_owned();

        assert_eq!(reg.conn_sub_count(&c), 0);
        reg.subscribe_many(&c, vec![r1.clone(), r2.clone()]);
        assert_eq!(reg.conn_sub_count(&c), 2);
        reg.subscribe_many(&c, vec![r1]); // idempotent
        assert_eq!(reg.conn_sub_count(&c), 2);
        reg.unsubscribe_many(&c, vec![r2]);
        assert_eq!(reg.conn_sub_count(&c), 1);
    }

    #[test]
    fn multi_conn_same_room() {
        let reg = SubscriptionRegistry::new();
        let c1 = conn("c1");
        let c2 = conn("c2");
        let r = room_id!("!r1:example.org").to_owned();

        reg.subscribe(c1.clone(), r.clone());
        reg.subscribe(c2.clone(), r.clone());

        let mut subs = reg.subscribers(&r);
        subs.sort_by(|a, b| a.as_str().cmp(b.as_str()));
        assert_eq!(subs, vec![c1.clone(), c2.clone()]);

        reg.unsubscribe(&c1, &r);
        assert_eq!(reg.subscribers(&r), vec![c2]);
        assert_consistent(&reg);
    }
}
