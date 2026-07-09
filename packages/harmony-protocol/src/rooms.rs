use std::collections::HashMap;

use futures_util::{Stream, StreamExt, stream};
use matrix_sdk::RoomMemberships;
use matrix_sdk::executor::{JoinHandleExt, spawn};
use matrix_sdk::ruma::{OwnedRoomId, RoomId};
use matrix_sdk_common::SendOutsideWasm;
use matrix_sdk_ui::eyeball_im::Vector;
use matrix_sdk_ui::room_list_service::filters::{new_filter_all, new_filter_identifiers};
use matrix_sdk_ui::room_list_service::{RoomList, RoomListItem, RoomListLoadingState};
use matrix_sdk_ui::spaces::SpaceFilter;
use tokio_stream::wrappers::BroadcastStream;

use crate::{
    Rpc, Shared, Subscription, client,
    diff::{ListDiff, convert_diffs},
    harmony, harmony_export,
    internal_error::InternalError,
    spaces, sync,
};

static ROOM_LIST: Shared<Option<&'static RoomList>> = Shared::new();

pub async fn ensure_room_list() -> Result<&'static RoomList, InternalError> {
    if let Some(rl) = ROOM_LIST.with(|opt| *opt) {
        return Ok(rl);
    }
    let rls = sync::get_room_list_service().ok_or(InternalError::ClientNotReady)?;
    let room_list = rls
        .all_rooms()
        .await
        .map_err(|err| InternalError::Sync(err.to_string()))?;
    if let Some(rl) = ROOM_LIST.with(|opt| *opt) {
        return Ok(rl);
    }
    let leaked: &'static RoomList = Box::leak(Box::new(room_list));
    ROOM_LIST.with(|opt| *opt = Some(leaked));
    Ok(leaked)
}

#[harmony]
#[derive(Clone)]
pub struct RoomData {
    pub room_id: String,
    pub display_name: String,
    pub room_type: Option<String>,
    pub unread_count: u32,
    pub mention_count: u32,
}

fn convert_room_list_item(item: &RoomListItem) -> RoomData {
    RoomData {
        room_id: item.room_id().to_string(),
        display_name: item
            .cached_display_name()
            .map(|n| n.to_string())
            .unwrap_or_default(),
        room_type: item.room_type().map(|t| t.to_string()),
        unread_count: item.num_unread_messages() as u32,
        mention_count: item.num_unread_mentions() as u32,
    }
}

fn descendants_for(filters: &Vector<SpaceFilter>, space_id: &RoomId) -> Vec<OwnedRoomId> {
    filters
        .iter()
        .find(|f| f.space_room.room_id == *space_id)
        .map(|f| f.descendants.clone())
        .unwrap_or_default()
}

#[harmony_export(domain = "rooms", action = "subscribe_in_space")]
pub async fn subscribe_in_space(
    space_id: String,
) -> Subscription<Vec<RoomData>, ListDiff<RoomData>> {
    subscribe_in_space_impl(space_id).await.into()
}

async fn subscribe_in_space_impl(
    space_id: String,
) -> Result<
    (
        Vec<RoomData>,
        impl Stream<Item = ListDiff<RoomData>> + SendOutsideWasm,
    ),
    InternalError,
> {
    let space_id: OwnedRoomId = space_id
        .try_into()
        .map_err(|_| InternalError::InvalidRoomId)?;

    let room_list = ensure_room_list().await?;
    let space_service = spaces::get_service().await?;

    let (initial_filters, mut diff_stream) = space_service.subscribe_to_space_filters().await;
    let mut filters: Vector<SpaceFilter> = initial_filters;

    let (entries, controller) = room_list.entries_with_dynamic_adapters(100);

    let mut last_descendants = descendants_for(&filters, &space_id);
    controller.set_filter(Box::new(new_filter_identifiers(last_descendants.clone())));

    // Watcher updates the room-list filter whenever the underlying space
    // hierarchy changes. Bound to the stream via the map closure capture
    // so consumer-side unsubscribe (drops the stream) drops the watcher.
    let watcher = spawn(async move {
        while let Some(batch) = diff_stream.next().await {
            for d in batch {
                d.apply(&mut filters);
            }
            let next = descendants_for(&filters, &space_id);
            if next != last_descendants {
                last_descendants.clone_from(&next);
                controller.set_filter(Box::new(new_filter_identifiers(next)));
            }
        }
    })
    .abort_on_drop();

    let initial: Vec<RoomData> = Vec::new();
    let updates = entries
        .flat_map(|diffs| stream::iter(convert_diffs(diffs, convert_room_list_item)))
        .map(move |diff| {
            let _ = &watcher;
            diff
        });

    Ok((initial, updates))
}

#[harmony]
#[derive(Clone)]
pub struct RoomDataWithSpace {
    pub room_id: String,
    pub display_name: String,
    pub unread_count: u32,
    pub mention_count: u32,
    pub parent_space: Option<spaces::SpaceData>,
}

// NOTE: not a `snapshot_for = "rooms.subscribe_in_space"` source. That
// subscription is per-space (`String` input, `Vec<RoomData>`), whereas
// `get_all` is global (`()` input, `Vec<RoomDataWithSpace>`) — the snapshot
// must share the subscription's input and initial type. Late joiners to
// `rooms.subscribe_in_space` fall back to an empty snapshot until a per-space
// snapshot RPC exists.
#[harmony_export(domain = "rooms", action = "get_all")]
pub async fn get_all() -> Rpc<Vec<RoomDataWithSpace>> {
    get_all_impl().await.into()
}

async fn get_all_impl() -> Result<Vec<RoomDataWithSpace>, InternalError> {
    let room_list = ensure_room_list().await?;
    let space_service = spaces::get_service().await?;

    let (filters, _stream) = space_service.subscribe_to_space_filters().await;
    let parents: HashMap<OwnedRoomId, spaces::SpaceData> = filters
        .iter()
        .filter(|f| f.level == 0)
        .flat_map(|f| {
            let parent = spaces::SpaceData {
                room_id: f.space_room.room_id.to_string(),
                display_name: f.space_room.display_name.clone(),
                avatar_url: f.space_room.avatar_url.as_ref().map(ToString::to_string),
            };
            f.descendants
                .iter()
                .map(move |d| (d.clone(), parent.clone()))
        })
        .collect();

    let mut loading = room_list.loading_state();
    let max_rooms = loop {
        match loading.get() {
            RoomListLoadingState::Loaded {
                maximum_number_of_rooms,
            } => break maximum_number_of_rooms,
            RoomListLoadingState::NotLoaded => {
                if loading.next().await.is_none() {
                    return Err(InternalError::Sync(
                        "Room list loading stream ended unexpectedly".to_string(),
                    ));
                }
            }
        }
    };
    let page_size = max_rooms.map_or(1000, |n| n as usize).max(1);

    let (entries, controller) = room_list.entries_with_dynamic_adapters(page_size);
    let mut entries = std::pin::pin!(entries);
    controller.set_filter(Box::new(new_filter_all(vec![])));

    let target = max_rooms.unwrap_or(0) as usize;
    let mut buffer: Vector<RoomListItem> = Vector::new();
    if let Some(initial) = entries.next().await {
        for diff in initial {
            diff.apply(&mut buffer);
        }
    }
    while target > 0 && buffer.len() < target {
        let Some(batch) = entries.next().await else {
            break;
        };
        for diff in batch {
            diff.apply(&mut buffer);
        }
    }

    Ok(buffer
        .iter()
        .map(|item| RoomDataWithSpace {
            room_id: item.room_id().to_string(),
            display_name: item
                .cached_display_name()
                .map(|n| n.to_string())
                .unwrap_or_default(),
            unread_count: item.num_unread_messages() as u32,
            mention_count: item.num_unread_mentions() as u32,
            parent_space: parents.get(item.room_id()).cloned(),
        })
        .collect())
}

#[harmony]
#[derive(Clone)]
pub struct MemberData {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

async fn fetch_joined_members(room: &matrix_sdk::Room) -> Result<Vec<MemberData>, InternalError> {
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

#[harmony_export(domain = "members", action = "get", snapshot_for = "members.subscribe")]
pub async fn get_members(room_id: String) -> Rpc<Vec<MemberData>> {
    get_members_impl(&room_id).await.into()
}

async fn get_members_impl(room_id: &str) -> Result<Vec<MemberData>, InternalError> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let room_id = <&RoomId>::try_from(room_id).map_err(|_| InternalError::InvalidRoomId)?;
    let room = client
        .get_room(room_id)
        .ok_or(InternalError::RoomNotFound)?;
    fetch_joined_members(&room).await
}

#[harmony_export(domain = "members", action = "subscribe")]
pub async fn subscribe_members(
    room_id: String,
) -> Subscription<Vec<MemberData>, ListDiff<MemberData>> {
    subscribe_members_impl(room_id).await.into()
}

async fn subscribe_members_impl(
    room_id: String,
) -> Result<
    (
        Vec<MemberData>,
        impl Stream<Item = ListDiff<MemberData>> + SendOutsideWasm,
    ),
    InternalError,
> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let parsed_id =
        <&RoomId>::try_from(room_id.as_str()).map_err(|_| InternalError::InvalidRoomId)?;
    let room = client
        .get_room(parsed_id)
        .ok_or(InternalError::RoomNotFound)?;

    let receiver = room.room_member_updates_sender.subscribe();
    let initial = fetch_joined_members(&room).await?;

    let updates = BroadcastStream::new(receiver).filter_map(move |_| {
        let room = room.clone();
        async move {
            let members = fetch_joined_members(&room).await.ok()?;
            // Reset-based replacement; finer-grained diffs are a future
            // optimization once matrix-sdk exposes member-level diffs.
            Some(ListDiff::Reset { values: members })
        }
    });

    Ok((initial, updates))
}
