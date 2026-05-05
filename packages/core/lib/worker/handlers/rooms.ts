import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import {
  createRoom,
  getAllRooms,
  getRoomMembers,
  getSpaceDescendants,
  subscribeRoomMembers,
  subscribeRoomsInSpace,
  unsubscribeRoomsInSpace,
} from "@harmony/wasm";
import { applyListDiff } from "@harmony/protocol";
import type { ListDiff, MemberSummary, RoomSummary, RoomWithSpaceSummary } from "@harmony/protocol";

type RoomSubscription = {
  reader: ReadableStreamDefaultReader<ListDiff<RoomSummary>[]>;
  wasmId: number;
};

const roomSubs = new Map<MessagePort, Map<string, RoomSubscription>>();

const handleSubscribe: HandlerFor<"h.rooms.subscribe"> = async (message, send) => {
  const { spaceId } = message;
  let perPort = roomSubs.get(send.port);
  if (perPort?.has(spaceId)) {
    send.respond({ type: "h.rooms.subscribed" });
    return;
  }
  if (!perPort) {
    perPort = new Map();
    roomSubs.set(send.port, perPort);
  }

  const [wasmId, stream] = await subscribeRoomsInSpace(spaceId);
  const reader = stream.getReader();
  perPort.set(spaceId, { reader, wasmId });

  send.respond({ type: "h.rooms.subscribed" });

  void pipe(
    reader,
    (diffs) => {
      send.port.postMessage({ type: `h.space.${spaceId}.rooms.update`, rooms: diffs });
    },
    (error) => {
      console.error("[rooms] stream error:", error);
      dropSubscription(send.port, spaceId);
    },
  );
};

const handleUnsubscribe: HandlerFor<"h.rooms.unsubscribe"> = async (message, send) => {
  dropSubscription(send.port, message.spaceId);
};

const handleGetIds: HandlerFor<"h.rooms.getIds"> = async (message, send) => {
  const roomIds = await getSpaceDescendants(message.spaceId);
  send.respond({ type: "h.rooms.gotIds", roomIds });
};

const handleGetAll: HandlerFor<"h.rooms.getAll"> = async (_message, send) => {
  const rooms = await getAllRooms();
  send.respond({ type: "h.rooms.gotAll", rooms });
};

function dropSubscription(port: MessagePort, spaceId: string) {
  const perPort = roomSubs.get(port);
  const sub = perPort?.get(spaceId);
  if (!sub || !perPort) return;

  sub.reader.cancel().catch(() => {});
  unsubscribeRoomsInSpace(sub.wasmId);
  perPort.delete(spaceId);
  if (perPort.size === 0) roomSubs.delete(port);
}

export function removeRoomsSubscriber(port: MessagePort) {
  const perPort = roomSubs.get(port);
  if (perPort) {
    for (const sub of perPort.values()) {
      sub.reader.cancel().catch(() => {});
      unsubscribeRoomsInSpace(sub.wasmId);
    }
    roomSubs.delete(port);
  }

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
  "h.rooms.getAll": handleGetAll,
  "h.rooms.create": handleCreate,
  "h.members.get": handleGetMembers,
  "h.members.subscribe": handleMembersSubscribe,
  "h.members.unsubscribe": handleMembersUnsubscribe,
};

declare module "@harmony/wasm" {
  export function subscribeRoomsInSpace(
    spaceId: string,
  ): Promise<[number, ReadableStream<ListDiff<RoomSummary>[]>]>;
  export function unsubscribeRoomsInSpace(subscriptionId: number): void;
  export function getSpaceDescendants(spaceId: string): Promise<string[]>;
  export function getAllRooms(): Promise<RoomWithSpaceSummary[]>;
  export function createRoom(
    spaceId: string,
    name: string,
    visibility: string,
  ): Promise<RoomSummary>;
  export function getRoomMembers(roomId: string): Promise<MemberSummary[]>;
  export function subscribeRoomMembers(roomId: string): Promise<[MemberSummary[], ReadableStream]>;
}
