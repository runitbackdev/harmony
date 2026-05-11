import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import {
  editMessage,
  focusOnEvent,
  getRoomState,
  markAsRead,
  paginateRoom,
  redactMessage,
  returnToLive,
  sendMessage,
  subscribeRoom,
  toggleReaction,
  unsubscribeRoom,
} from "@harmony/wasm";
import type { TimelineEvent, TimelineStreamMessage } from "@harmony/protocol";

const roomPorts = new Map<string, Set<MessagePort>>();
const readers = new Map<string, ReadableStreamDefaultReader<TimelineStreamMessage>>();

function cancelStream(roomId: string) {
  readers
    .get(roomId)
    ?.cancel()
    .catch(() => {});
  readers.delete(roomId);
  unsubscribeRoom(roomId);
}

const handleSubscribe: HandlerFor<"h.timeline.subscribe"> = async (message, send) => {
  const { roomId } = message;
  const ports = roomPorts.get(roomId);

  if (ports) {
    ports.add(send.port);
    const snapshot = await getRoomState(roomId);
    send.respond({
      type: "h.timeline.subscribed",
      events: snapshot.events,
      mode: snapshot.mode,
      generation: snapshot.generation,
    });
    return;
  }

  roomPorts.set(roomId, new Set([send.port]));

  const [snapshot, rawStream] = await subscribeRoom(roomId);
  const stream = rawStream as ReadableStream<TimelineStreamMessage>;
  const reader = stream.getReader();
  readers.set(roomId, reader);

  send.respond({
    type: "h.timeline.subscribed",
    events: snapshot.events,
    mode: snapshot.mode,
    generation: snapshot.generation,
  });

  void pipe(
    reader,
    (msg) => send.broadcast({ type: "h.timeline.update", roomId, message: msg }),
    (error) => {
      console.error(`[timeline] stream error for ${roomId}:`, error);
      send.broadcast({
        type: "h.timeline.update",
        roomId,
        message: { kind: "error", message: String(error) },
      });
    },
  );
};

const handleUnsubscribe: HandlerFor<"h.timeline.unsubscribe"> = async (message, send) => {
  const { roomId } = message;
  const ports = roomPorts.get(roomId);
  if (!ports) return;

  ports.delete(send.port);

  if (ports.size === 0) {
    cancelStream(roomId);
    roomPorts.delete(roomId);
  }
};

const handleFocusOnEvent: HandlerFor<"h.timeline.focusOnEvent"> = async (message, send) => {
  const { roomId, targetEventId, numContextEvents } = message;
  const result = await focusOnEvent(roomId, targetEventId, numContextEvents);
  send.respond({
    type: "h.timeline.focusedOnEvent",
    events: result.events,
    mode: result.mode,
    generation: result.generation,
  });
};

const handleReturnToLive: HandlerFor<"h.timeline.returnToLive"> = async (message, send) => {
  const { roomId } = message;
  const result = await returnToLive(roomId);
  send.respond({
    type: "h.timeline.returnedToLive",
    events: result.events,
    mode: result.mode,
    generation: result.generation,
  });
};

export function removeTimelineSubscriber(port: MessagePort) {
  for (const roomId of [...roomPorts.keys()]) {
    const ports = roomPorts.get(roomId);
    if (!ports) continue;
    ports.delete(port);
    if (ports.size === 0) {
      cancelStream(roomId);
      roomPorts.delete(roomId);
    }
  }
}

const handleSend: HandlerFor<"h.timeline.send"> = async (message, send) => {
  const { roomId, body, formattedBody, replyToEventId } = message;
  await sendMessage(roomId, body, formattedBody, replyToEventId);
  send.respond({ type: "h.timeline.sent" });
};

const handleEdit: HandlerFor<"h.timeline.edit"> = async (message, send) => {
  const { roomId, eventId, transactionId, body, formattedBody } = message;
  await editMessage(roomId, eventId, transactionId, body, formattedBody);
  send.respond({ type: "h.timeline.edited" });
};

const handleToggleReaction: HandlerFor<"h.timeline.toggleReaction"> = async (message, send) => {
  const { roomId, eventId, transactionId, key } = message;
  const added = await toggleReaction(roomId, eventId, transactionId, key);
  send.respond({ type: "h.timeline.reactionToggled", added });
};

const handleRedact: HandlerFor<"h.timeline.redact"> = async (message, send) => {
  const { roomId, eventId, transactionId } = message;
  await redactMessage(roomId, eventId, transactionId);
  send.respond({ type: "h.timeline.redacted" });
};

const handlePaginate: HandlerFor<"h.timeline.paginate"> = async (message, send) => {
  const { roomId, direction, count } = message;
  const result = await paginateRoom(roomId, direction, count);
  send.respond({
    type: "h.timeline.paginated",
    exhausted: result.exhausted,
    mode: result.mode,
    events: result.events,
    generation: result.generation,
  });
};

const handleMarkAsRead: HandlerFor<"h.timeline.markAsRead"> = async (message, send) => {
  const { roomId } = message;
  await markAsRead(roomId);
  send.respond({ type: "h.timeline.markedAsRead" });
};

export const timelineHandlers: HandlerMap = {
  "h.timeline.subscribe": handleSubscribe,
  "h.timeline.unsubscribe": handleUnsubscribe,
  "h.timeline.focusOnEvent": handleFocusOnEvent,
  "h.timeline.returnToLive": handleReturnToLive,
  "h.timeline.send": handleSend,
  "h.timeline.edit": handleEdit,
  "h.timeline.toggleReaction": handleToggleReaction,
  "h.timeline.redact": handleRedact,
  "h.timeline.paginate": handlePaginate,
  "h.timeline.markAsRead": handleMarkAsRead,
};

type RoomSnapshot = {
  events: TimelineEvent[];
  mode: import("@harmony/protocol").TimelineMode;
  generation: number;
};

declare module "@harmony/wasm" {
  export function subscribeRoom(
    roomId: string,
  ): Promise<[RoomSnapshot, ReadableStream<TimelineStreamMessage>]>;
  export function unsubscribeRoom(roomId: string): void;
  export function focusOnEvent(
    roomId: string,
    targetEventId: string,
    numContextEvents?: number,
  ): Promise<RoomSnapshot>;
  export function returnToLive(roomId: string): Promise<RoomSnapshot>;
  export function paginateRoom(
    roomId: string,
    direction: import("@harmony/protocol").PaginationDirection,
    count: number,
  ): Promise<{
    exhausted: boolean;
    mode: import("@harmony/protocol").TimelineMode;
    events?: TimelineEvent[];
    generation?: number;
  }>;
  export function getRoomState(roomId: string): Promise<RoomSnapshot>;
  export function sendMessage(
    roomId: string,
    body: string,
    formattedBody?: string,
    replyToEventId?: string,
  ): Promise<void>;
  export function editMessage(
    roomId: string,
    eventId?: string,
    transactionId?: string,
    body?: string,
    formattedBody?: string,
  ): Promise<void>;
  export function redactMessage(
    roomId: string,
    eventId?: string,
    transactionId?: string,
  ): Promise<void>;
  export function markAsRead(roomId: string): Promise<void>;
  export function toggleReaction(
    roomId: string,
    eventId?: string,
    transactionId?: string,
    key?: string,
  ): Promise<boolean>;
}
