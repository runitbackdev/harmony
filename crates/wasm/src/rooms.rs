use std::cell::RefCell;
use std::collections::HashMap;

use futures_util::StreamExt;
use matrix_sdk::ruma::OwnedRoomId;
use matrix_sdk_ui::spaces::room_list::{SpaceRoomList, SpaceRoomListPaginationState};
use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

use crate::{diff::serialize_diffs, errors::HarmonyError, spaces, subscription::Subscription};

thread_local! {
    static ROOM_LISTS: RefCell<HashMap<OwnedRoomId, SpaceRoomList>> = RefCell::new(HashMap::new());
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct RoomData {
    pub room_id: String,
    pub display_name: String,
    pub room_type: Option<String>,
}

fn convert_room(room: &matrix_sdk_ui::spaces::SpaceRoom) -> RoomData {
    RoomData {
        room_id: room.room_id.to_string(),
        display_name: room.display_name.clone(),
        room_type: room.room_type.as_ref().map(ToString::to_string),
    }
}

pub async fn subscribe_space_rooms_impl(
    space_id: &str,
) -> Result<Subscription<RoomData>, HarmonyError> {
    let service = spaces::get_service().await?;
    let room_id: OwnedRoomId = space_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let room_list = service.space_room_list(room_id.clone()).await;

    loop {
        room_list.paginate().await?;
        if matches!(
            room_list.pagination_state(),
            SpaceRoomListPaginationState::Idle { end_reached: true }
        ) {
            break;
        }
    }

    let (initial_values, incoming) = room_list.subscribe_to_room_updates();

    ROOM_LISTS.with(|lists| lists.borrow_mut().insert(room_id, room_list));

    let initial = initial_values.iter().map(convert_room).collect();
    let updates = incoming.map(|diffs| serialize_diffs(diffs, convert_room));
    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();

    Ok(Subscription { initial, stream })
}

pub fn get_space_rooms_impl(space_id: &str) -> Result<Vec<RoomData>, HarmonyError> {
    let room_id: OwnedRoomId = space_id
        .try_into()
        .map_err(|_| HarmonyError::InvalidUserId)?;

    let rooms = ROOM_LISTS.with(|lists| {
        lists
            .borrow()
            .get(&room_id)
            .map(|list| list.rooms().into_iter().map(|r| convert_room(&r)).collect())
    });

    Ok(rooms.unwrap_or_default())
}
