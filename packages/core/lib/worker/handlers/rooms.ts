import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import { createRoom, setRoomFilter, subscribeRoomList, subscribeSpaceFilters } from "@harmony/wasm";
import { applyListDiff } from "@harmony/protocol";
import type { ListDiff, RoomSummary } from "@harmony/protocol";

type SpaceFilterData = {
  spaceId: string;
  level: number;
  descendants: string[];
};

const subscribedPorts = new Set<MessagePort>();
let roomListReader: ReadableStreamDefaultReader<ListDiff<RoomSummary>[]> | null = null;
let spaceFiltersReader: ReadableStreamDefaultReader<ListDiff<SpaceFilterData>[]> | null = null;
let currentSpaceId: string | null = null;
const spaceFilters: SpaceFilterData[] = [];

function descendantsForSpace(spaceId: string): string[] {
  const filter = spaceFilters.find((sf) => sf.level === 0 && sf.spaceId === spaceId);
  return filter?.descendants ?? [];
}

function broadcastRoomUpdate(rooms: ListDiff<RoomSummary>[]) {
  for (const port of subscribedPorts) {
    port.postMessage({ type: "h.rooms.update", rooms });
  }
}

async function initializeIfNeeded() {
  if (roomListReader) return;

  const roomListStream = await subscribeRoomList();
  roomListReader = roomListStream.getReader();

  void pipe(
    roomListReader,
    (roomDiffs) => broadcastRoomUpdate(roomDiffs),
    (error) => console.error("[rooms] room list stream error:", error),
  );

  const [initialFilters, filtersStream] = await subscribeSpaceFilters();
  spaceFilters.push(...initialFilters);
  spaceFiltersReader = filtersStream.getReader();

  void pipe(
    spaceFiltersReader,
    (filterDiffs) => {
      for (const diff of filterDiffs) {
        applyListDiff(spaceFilters, diff);
      }

      if (currentSpaceId) {
        const descendants = descendantsForSpace(currentSpaceId);
        setRoomFilter(descendants);
      }
    },
    (error) => console.error("[rooms] space filters stream error:", error),
  );
}

const handleSubscribe: HandlerFor<"h.rooms.subscribe"> = async (message, send) => {
  const { spaceId } = message;
  subscribedPorts.add(send.port);

  await initializeIfNeeded();

  currentSpaceId = spaceId;
  const descendants = descendantsForSpace(spaceId);
  setRoomFilter(descendants);

  send.respond({ type: "h.rooms.subscribed" });
};

const handleUnsubscribe: HandlerFor<"h.rooms.unsubscribe"> = async (_message, send) => {
  subscribedPorts.delete(send.port);
};

export function removeRoomsSubscriber(port: MessagePort) {
  subscribedPorts.delete(port);
}

const handleCreate: HandlerFor<"h.rooms.create"> = async (message, send) => {
  const { spaceId, name } = message;
  const room = await createRoom(spaceId, name);
  send.respond({ type: "h.rooms.created", room });
};

export const roomsHandlers: HandlerMap = {
  "h.rooms.subscribe": handleSubscribe,
  "h.rooms.unsubscribe": handleUnsubscribe,
  "h.rooms.create": handleCreate,
};

declare module "@harmony/wasm" {
  export function subscribeRoomList(): Promise<ReadableStream>;
  export function setRoomFilter(roomIds: string[]): void;
  export function subscribeSpaceFilters(): Promise<[SpaceFilterData[], ReadableStream]>;
  export function createRoom(spaceId: string, name: string): Promise<RoomData>;
}
