import { applyListDiff } from "@harmony/core/protocol";
import { rpc } from "@harmony/core";
import { useListSubscription } from "@harmony/react";
import type { RoomData } from "@harmony/core";

export const getAllRooms = () => rpc("rooms.get_all", undefined);

const EMPTY: RoomData[] = [];

export function useRoomsInSpace(spaceId: string) {
  return useListSubscription("rooms.subscribe_in_space", spaceId, (state, diff) => {
    const next = [...(state ?? EMPTY)];
    applyListDiff(next, diff);
    return next;
  });
}
