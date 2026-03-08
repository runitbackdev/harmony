import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import { getSpaceRooms, subscribeSpaceRooms } from "@harmony/wasm";
import type { ListDiff, RoomSummary } from "@harmony/protocol";

type SpaceSubscription = {
  ports: Set<MessagePort>;
  reader: ReadableStreamDefaultReader<ListDiff<RoomSummary>[]> | null;
};

const subscriptions = new Map<string, SpaceSubscription>();

function cancelStream(sub: SpaceSubscription) {
  sub.reader?.cancel().catch(() => {});
  sub.reader = null;
}

const handleSubscribe: HandlerFor<"h.rooms.subscribe"> = async (
  message,
  send,
) => {
  const { spaceId } = message;
  let sub = subscriptions.get(spaceId);

  if (sub) {
    sub.ports.add(send.port);
    const rooms = getSpaceRooms(spaceId);
    send.respond({ type: "h.rooms.subscribed", rooms });
    return;
  }

  sub = { ports: new Set([send.port]), reader: null };
  subscriptions.set(spaceId, sub);

  const [rooms, stream] = await subscribeSpaceRooms(spaceId);
  sub.reader = stream.getReader();

  send.respond({ type: "h.rooms.subscribed", rooms });

  pipe(sub.reader, (rooms) => {
    for (const port of sub.ports) {
      port.postMessage({ type: "h.rooms.update", spaceId, rooms });
    }
  });
};

const handleUnsubscribe: HandlerFor<"h.rooms.unsubscribe"> = async (
  message,
  send,
) => {
  const { spaceId } = message;
  const sub = subscriptions.get(spaceId);
  if (!sub) return;

  sub.ports.delete(send.port);

  if (sub.ports.size === 0) {
    cancelStream(sub);
    subscriptions.delete(spaceId);
  }
};

export function removeRoomsSubscriber(port: MessagePort) {
  for (const [spaceId, sub] of subscriptions) {
    sub.ports.delete(port);

    if (sub.ports.size === 0) {
      cancelStream(sub);
      subscriptions.delete(spaceId);
    }
  }
}

export const roomsHandlers: HandlerMap = {
  "h.rooms.subscribe": handleSubscribe,
  "h.rooms.unsubscribe": handleUnsubscribe,
};

declare module "@harmony/wasm" {
  export function subscribeSpaceRooms(
    spaceId: string,
  ): Promise<[RoomData[], ReadableStream]>;
  export function getSpaceRooms(spaceId: string): RoomData[];
}
