use futures_util::future::BoxFuture;
use ruma::{OwnedRoomId, OwnedUserId, RoomId, UserId};

use crate::matrix::{MatrixClient, MatrixError};

pub trait MatrixApi: Send + Sync + 'static {
    fn joined_rooms<'a>(
        &'a self,
        user: &'a UserId,
    ) -> BoxFuture<'a, Result<Vec<OwnedRoomId>, MatrixError>>;

    fn joined_members<'a>(
        &'a self,
        room: &'a RoomId,
    ) -> BoxFuture<'a, Result<Vec<OwnedUserId>, MatrixError>>;
}

impl MatrixApi for MatrixClient {
    fn joined_rooms<'a>(
        &'a self,
        user: &'a UserId,
    ) -> BoxFuture<'a, Result<Vec<OwnedRoomId>, MatrixError>> {
        Box::pin(self.joined_rooms(user))
    }

    fn joined_members<'a>(
        &'a self,
        room: &'a RoomId,
    ) -> BoxFuture<'a, Result<Vec<OwnedUserId>, MatrixError>> {
        Box::pin(self.joined_members(room))
    }
}
