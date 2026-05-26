use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use moka::future::Cache;
use ruma::{OwnedRoomId, OwnedUserId, RoomId, UserId};

use crate::matrix::{MatrixApi, MatrixError};

#[derive(Debug, Clone, thiserror::Error)]
pub enum MembershipError {
    #[error(transparent)]
    Matrix(Arc<MatrixError>),
}

impl From<Arc<MatrixError>> for MembershipError {
    fn from(value: Arc<MatrixError>) -> Self {
        Self::Matrix(value)
    }
}

pub type SpacesSet = Arc<HashSet<OwnedRoomId>>;
pub type MembersSet = Arc<HashSet<OwnedUserId>>;

#[derive(Clone)]
pub struct MembershipCache {
    matrix: Arc<dyn MatrixApi>,
    spaces_of: Cache<OwnedUserId, SpacesSet>,
    members_of: Cache<OwnedRoomId, MembersSet>,
}

impl MembershipCache {
    pub fn new(matrix: Arc<dyn MatrixApi>, ttl: Duration, max_users: u64, max_rooms: u64) -> Self {
        let spaces_of = Cache::builder()
            .max_capacity(max_users)
            .time_to_live(ttl)
            .build();
        let members_of = Cache::builder()
            .max_capacity(max_rooms)
            .time_to_live(ttl)
            .build();
        Self {
            matrix,
            spaces_of,
            members_of,
        }
    }

    pub async fn spaces_of(&self, user: &UserId) -> Result<SpacesSet, MembershipError> {
        let key = user.to_owned();
        let matrix = self.matrix.clone();
        self.spaces_of
            .try_get_with(key.clone(), async move {
                let rooms = matrix.joined_rooms(&key).await?;
                Ok::<SpacesSet, MatrixError>(Arc::new(rooms.into_iter().collect()))
            })
            .await
            .map_err(MembershipError::from)
    }

    pub async fn members_of(&self, room: &RoomId) -> Result<MembersSet, MembershipError> {
        let key = room.to_owned();
        let matrix = self.matrix.clone();
        self.members_of
            .try_get_with(key.clone(), async move {
                let members = matrix.joined_members(&key).await?;
                Ok::<MembersSet, MatrixError>(Arc::new(members.into_iter().collect()))
            })
            .await
            .map_err(MembershipError::from)
    }

    pub fn prefetch_spaces_of(&self, user: &UserId) {
        let cache = self.clone();
        let user = user.to_owned();
        tokio::spawn(async move {
            if let Err(err) = cache.spaces_of(&user).await {
                tracing::debug!(%user, ?err, "prefetch spaces_of failed");
            }
        });
    }

    pub fn prefetch_members_of(&self, room: &RoomId) {
        let cache = self.clone();
        let room = room.to_owned();
        tokio::spawn(async move {
            if let Err(err) = cache.members_of(&room).await {
                tracing::debug!(%room, ?err, "prefetch members_of failed");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::BoxFuture;
    use ruma::{room_id, user_id};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::Notify;

    struct MockMatrix {
        spaces_calls: AtomicUsize,
        members_calls: AtomicUsize,
        spaces_response: Result<Vec<OwnedRoomId>, MatrixError>,
        members_response: Result<Vec<OwnedUserId>, MatrixError>,
        gate: Option<Arc<Notify>>,
    }

    impl MockMatrix {
        fn new() -> Self {
            Self {
                spaces_calls: AtomicUsize::new(0),
                members_calls: AtomicUsize::new(0),
                spaces_response: Ok(vec![room_id!("!r1:example.org").to_owned()]),
                members_response: Ok(vec![user_id!("@alice:example.org").to_owned()]),
                gate: None,
            }
        }

        fn with_spaces_error(mut self) -> Self {
            self.spaces_response = Err(MatrixError::Transport("synapse down".into()));
            self
        }

        fn with_gate(mut self, gate: Arc<Notify>) -> Self {
            self.gate = Some(gate);
            self
        }
    }

    impl MatrixApi for MockMatrix {
        fn joined_rooms<'a>(
            &'a self,
            _user: &'a UserId,
        ) -> BoxFuture<'a, Result<Vec<OwnedRoomId>, MatrixError>> {
            Box::pin(async move {
                self.spaces_calls.fetch_add(1, Ordering::SeqCst);
                if let Some(gate) = self.gate.as_ref() {
                    gate.notified().await;
                }
                self.spaces_response.clone()
            })
        }

        fn joined_members<'a>(
            &'a self,
            _room: &'a RoomId,
        ) -> BoxFuture<'a, Result<Vec<OwnedUserId>, MatrixError>> {
            Box::pin(async move {
                self.members_calls.fetch_add(1, Ordering::SeqCst);
                self.members_response.clone()
            })
        }
    }

    fn cache(matrix: Arc<dyn MatrixApi>) -> MembershipCache {
        MembershipCache::new(matrix, Duration::from_mins(1), 100, 100)
    }

    #[tokio::test]
    async fn cache_hit_avoids_refetch() {
        let mock = Arc::new(MockMatrix::new());
        let cache = cache(mock.clone());
        let user = user_id!("@alice:example.org");

        let _ = cache.spaces_of(user).await.expect("first call");
        let _ = cache.spaces_of(user).await.expect("second call");

        assert_eq!(mock.spaces_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn singleflight_collapses_concurrent_misses() {
        let gate = Arc::new(Notify::new());
        let mock = Arc::new(MockMatrix::new().with_gate(gate.clone()));
        let cache = cache(mock.clone());
        let user = user_id!("@alice:example.org").to_owned();

        let mut handles = Vec::new();
        for _ in 0..50 {
            let cache = cache.clone();
            let user = user.clone();
            handles.push(tokio::spawn(async move { cache.spaces_of(&user).await }));
        }

        tokio::time::sleep(Duration::from_millis(10)).await;
        gate.notify_waiters();

        for handle in handles {
            handle.await.expect("task panicked").expect("spaces_of");
        }
        assert_eq!(mock.spaces_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn error_propagates_as_membership_error() {
        let mock = Arc::new(MockMatrix::new().with_spaces_error());
        let cache = cache(mock);
        let user = user_id!("@alice:example.org");

        let err = cache.spaces_of(user).await.expect_err("should fail");
        let MembershipError::Matrix(inner) = err;
        assert!(matches!(*inner, MatrixError::Transport(_)));
    }
}
