import { harmony } from "@harmony/core";
import { applyListDiff, type RoomSummary } from "@harmony/protocol";
import { createKeyedSubscription } from "./subscription";

const rooms = createKeyedSubscription<string, RoomSummary>((spaceId, items) =>
  harmony.rooms.subscribe(spaceId).then(() => {
    const unsub = harmony.on("h.rooms.update", ({ rooms: diffs }) => {
      for (const diff of diffs) applyListDiff(items, diff);
    });

    return {
      initial: [],
      cleanup: () => {
        unsub();
        harmony.rooms.unsubscribe(spaceId);
      },
    };
  }),
);

export const useRooms = rooms.useValue;
export const subscribeRooms = rooms.start;

import type { ChannelVisibility, MemberSummary } from "@harmony/protocol";

export async function createRoom(spaceId: string, name: string, visibility: ChannelVisibility) {
  const { room } = await harmony.rooms.create(spaceId, name, visibility);
  return room;
}

export async function getMembers(roomId: string): Promise<MemberSummary[]> {
  const { members } = await harmony.rooms.getMembers(roomId);
  return members;
}
