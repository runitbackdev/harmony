use std::cell::RefCell;

use futures_util::StreamExt;
use matrix_sdk::RoomMemberships;
use matrix_sdk::ruma::{OwnedRoomId, RoomId};
use matrix_sdk_ui::room_list_service::filters::new_filter_identifiers;
use matrix_sdk_ui::room_list_service::{RoomList, RoomListDynamicEntriesController, RoomListItem};
use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

use crate::{client, diff::convert_diffs, errors::HarmonyError, sync};

type ControllerCell = RefCell<Option<RoomListDynamicEntriesController>>;

thread_local! {
    static CONTROLLER: ControllerCell = const { RefCell::new(None) };
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct RoomData {
    pub room_id: String,
    pub display_name: String,
    pub room_type: Option<String>,
    pub unread_count: u64,
    pub mention_count: u64,
}

fn convert_room_list_item(item: &RoomListItem) -> RoomData {
    RoomData {
        room_id: item.room_id().to_string(),
        display_name: item
            .cached_display_name()
            .map(|n| n.to_string())
            .unwrap_or_default(),
        room_type: item.room_type().map(|t| t.to_string()),
        unread_count: item.num_unread_messages(),
        mention_count: item.num_unread_mentions(),
    }
}

pub async fn subscribe_room_list_impl() -> Result<web_sys::ReadableStream, HarmonyError> {
    let rls = sync::get_room_list_service().ok_or(HarmonyError::ClientNotReady)?;
    let room_list = rls
        .all_rooms()
        .await
        .map_err(|err| HarmonyError::Sync(err.to_string()))?;

    // Leak the RoomList so the entries stream (which borrows it) can be 'static.
    // This is fine — we only subscribe once for the app's lifetime.
    let room_list: &'static RoomList = Box::leak(Box::new(room_list));

    let (entries, controller) = room_list.entries_with_dynamic_adapters(100);
    CONTROLLER.with(|cell| *cell.borrow_mut() = Some(controller));

    let updates = entries.map(|diffs| {
        let list_diffs = convert_diffs(diffs, convert_room_list_item);
        serde_wasm_bindgen::to_value(&list_diffs)
            .map_err(|err| wasm_bindgen::JsValue::from_str(&err.to_string()))
    });

    let stream = wasm_streams::ReadableStream::from_stream(updates).into_raw();
    Ok(stream)
}

pub fn set_room_filter_impl(room_ids: Vec<String>) -> Result<(), HarmonyError> {
    CONTROLLER.with(|cell| {
        let controller = cell.borrow();
        let controller = controller.as_ref().ok_or(HarmonyError::ClientNotReady)?;

        let owned_ids: Vec<OwnedRoomId> = room_ids
            .into_iter()
            .filter_map(|id| id.try_into().ok())
            .collect();

        controller.set_filter(Box::new(new_filter_identifiers(owned_ids)));
        Ok(())
    })
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct MemberData {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub async fn get_room_members_impl(room_id: &str) -> Result<Vec<MemberData>, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let room_id = <&RoomId>::try_from(room_id).map_err(|_| HarmonyError::RoomNotFound)?;
    let room = client.get_room(room_id).ok_or(HarmonyError::RoomNotFound)?;

    let members = room.members(RoomMemberships::JOIN).await?;

    Ok(members
        .into_iter()
        .map(|m| MemberData {
            user_id: m.user_id().to_string(),
            display_name: m.display_name().map(String::from),
            avatar_url: m.avatar_url().map(ToString::to_string),
        })
        .collect())
}
