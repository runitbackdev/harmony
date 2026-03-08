import { harmony } from "@harmony/core";
import { applyListDiff, type RoomSummary } from "@harmony/protocol";
import { createKeyedSubscription } from "./subscription";

const rooms = createKeyedSubscription<string, RoomSummary>((spaceId, items) =>
  harmony.rooms.subscribe(spaceId).then(({ rooms: initial }) => {
    const unsub = harmony.on(
      "h.rooms.update",
      ({ spaceId: sid, rooms: diffs }) => {
        if (sid !== spaceId) return;
        for (const diff of diffs) applyListDiff(items, diff);
      },
    );

    return {
      initial,
      cleanup: () => {
        unsub();
        harmony.rooms.unsubscribe(spaceId);
      },
    };
  }),
);

export const useRooms = rooms.useValue;
export const subscribeRooms = rooms.start;
