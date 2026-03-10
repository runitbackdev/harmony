import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import { getTimeline, sendMessage, subscribeTimeline } from "@harmony/wasm";
import type { ListDiff, TimelineEvent } from "@harmony/protocol";

const roomPorts = new Map<string, Set<MessagePort>>();
const readers = new Map<
  string,
  ReadableStreamDefaultReader<ListDiff<TimelineEvent>[]>
>();

function cancelStream(roomId: string) {
  readers
    .get(roomId)
    ?.cancel()
    .catch(() => {});
  readers.delete(roomId);
}

const handleSubscribe: HandlerFor<"h.timeline.subscribe"> = async (
  message,
  send,
) => {
  const { roomId } = message;
  let ports = roomPorts.get(roomId);

  if (ports) {
    ports.add(send.port);
    const events = await getTimeline(roomId);
    send.respond({ type: "h.timeline.subscribed", events });
    return;
  }

  ports = new Set([send.port]);
  roomPorts.set(roomId, ports);

  const [events, stream] = await subscribeTimeline(roomId);
  const reader = stream.getReader();
  readers.set(roomId, reader);

  send.respond({ type: "h.timeline.subscribed", events });

  pipe(reader, (events) => {
    send.broadcast({ type: "h.timeline.update", roomId, events });
  });
};

const handleUnsubscribe: HandlerFor<"h.timeline.unsubscribe"> = async (
  message,
  send,
) => {
  const { roomId } = message;
  const ports = roomPorts.get(roomId);
  if (!ports) return;

  ports.delete(send.port);

  if (ports.size === 0) {
    cancelStream(roomId);
    roomPorts.delete(roomId);
  }
};

export function removeTimelineSubscriber(port: MessagePort) {
  for (const [roomId, ports] of roomPorts) {
    ports.delete(port);

    if (ports.size === 0) {
      cancelStream(roomId);
      roomPorts.delete(roomId);
    }
  }
}

const handleSend: HandlerFor<"h.timeline.send"> = async (message, send) => {
  const { roomId, body } = message;
  await sendMessage(roomId, body);
  send.respond({ type: "h.timeline.sent" });
};

export const timelineHandlers: HandlerMap = {
  "h.timeline.subscribe": handleSubscribe,
  "h.timeline.unsubscribe": handleUnsubscribe,
  "h.timeline.send": handleSend,
};

declare module "@harmony/wasm" {
  export function subscribeTimeline(
    roomId: string,
  ): Promise<[TimelineEvent[], ReadableStream]>;
  export function getTimeline(roomId: string): Promise<TimelineEvent[]>;
  export function sendMessage(roomId: string, body: string): Promise<void>;
}
