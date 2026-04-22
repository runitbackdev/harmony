import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import {
  createRoom,
  getRoomMembers,
  setRoomFilter,
  subscribeRoomList,
  subscribeRoomMembers,
  subscribeSpaceFilters,
} from "@harmony/wasm";
import { applyListDiff } from "@harmony/protocol";
import type { ListDiff, MemberSummary, RoomSummary } from "@harmony/protocol";

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

const handleGetIds: HandlerFor<"h.rooms.getIds"> = async (message, send) => {
  await initializeIfNeeded();
  send.respond({ type: "h.rooms.gotIds", roomIds: descendantsForSpace(message.spaceId) });
};

export function removeRoomsSubscriber(port: MessagePort) {
  subscribedPorts.delete(port);

  for (const [roomId, sub] of memberSubs) {
    if (!sub.ports.has(port)) continue;
    sub.ports.delete(port);
    if (sub.ports.size === 0) {
      sub.reader.cancel().catch(() => {});
      memberSubs.delete(roomId);
    }
  }
}

const handleCreate: HandlerFor<"h.rooms.create"> = async (message, send) => {
  const { spaceId, name, visibility } = message;
  const room = await createRoom(spaceId, name, visibility);
  send.respond({ type: "h.rooms.created", room });
};

const handleGetMembers: HandlerFor<"h.members.get"> = async (message, send) => {
  const { roomId } = message;
  const members = await getRoomMembers(roomId);
  send.respond({ type: "h.members.got", members });
};

type MemberSubscription = {
  reader: ReadableStreamDefaultReader<ListDiff<MemberSummary>[]>;
  ports: Set<MessagePort>;
  members: MemberSummary[];
};

const memberSubs = new Map<string, MemberSubscription>();

const handleMembersSubscribe: HandlerFor<"h.members.subscribe"> = async (message, send) => {
  const { roomId } = message;
  const existing = memberSubs.get(roomId);

  if (existing) {
    existing.ports.add(send.port);
    send.respond({ type: "h.members.subscribed", members: existing.members });
    return;
  }

  const [initial, stream] = await subscribeRoomMembers(roomId);
  const reader = stream.getReader();
  const sub: MemberSubscription = {
    reader,
    ports: new Set([send.port]),
    members: [...initial],
  };
  memberSubs.set(roomId, sub);

  send.respond({ type: "h.members.subscribed", members: initial });

  void pipe(
    reader,
    (diffs) => {
      for (const diff of diffs) applyListDiff(sub.members, diff);
      for (const port of sub.ports) {
        port.postMessage({ type: "h.members.update", roomId, members: diffs });
      }
    },
    (error) => console.error("[members] stream error:", error),
  );
};

const handleMembersUnsubscribe: HandlerFor<"h.members.unsubscribe"> = async (message, send) => {
  const { roomId } = message;
  const sub = memberSubs.get(roomId);
  if (!sub) return;

  sub.ports.delete(send.port);
  if (sub.ports.size === 0) {
    sub.reader.cancel().catch(() => {});
    memberSubs.delete(roomId);
  }
};

export const roomsHandlers: HandlerMap = {
  "h.rooms.subscribe": handleSubscribe,
  "h.rooms.unsubscribe": handleUnsubscribe,
  "h.rooms.getIds": handleGetIds,
  "h.rooms.create": handleCreate,
  "h.members.get": handleGetMembers,
  "h.members.subscribe": handleMembersSubscribe,
  "h.members.unsubscribe": handleMembersUnsubscribe,
};

declare module "@harmony/wasm" {
  export function subscribeRoomList(): Promise<ReadableStream>;
  export function setRoomFilter(roomIds: string[]): void;
  export function subscribeSpaceFilters(): Promise<[SpaceFilterData[], ReadableStream]>;
  export function createRoom(
    spaceId: string,
    name: string,
    visibility: string,
  ): Promise<RoomSummary>;
  export function getRoomMembers(roomId: string): Promise<MemberSummary[]>;
  export function subscribeRoomMembers(roomId: string): Promise<[MemberSummary[], ReadableStream]>;
}
