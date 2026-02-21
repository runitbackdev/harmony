import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import { getSpaces, subscribeSpaces } from "@harmony/wasm";
import type { ListDiff, SpaceSummary } from "@harmony/protocol";

const spacePorts = new Set<MessagePort>();
let spacesReader: ReadableStreamDefaultReader<ListDiff<SpaceSummary>[]> | null =
  null;

function cancelStream() {
  spacesReader?.cancel().catch(() => {});
  spacesReader = null;
}

const handleSubscribe: HandlerFor<"h.spaces.subscribe"> = async (
  _message,
  send,
) => {
  spacePorts.add(send.port);

  if (spacePorts.size > 1) {
    const spaces = await getSpaces();

    send.respond({ type: "h.spaces.subscribed", spaces });
    return;
  }

  const [spaces, stream] = await subscribeSpaces();

  spacesReader = stream.getReader();
  send.respond({ type: "h.spaces.subscribed", spaces: spaces });

  pipe(spacesReader, (spaces) => {
    send.broadcast({ type: "h.spaces.update", spaces });
  });
};

const handleUnsubscribe: HandlerFor<"h.spaces.unsubscribe"> = async (
  _message,
  send,
) => {
  spacePorts.delete(send.port);

  if (spacePorts.size === 0) {
    cancelStream();
  }
};

export function removeSpacesSubscriber(port: MessagePort) {
  spacePorts.delete(port);

  if (spacePorts.size === 0) {
    cancelStream();
  }
}

export const spacesHandlers: HandlerMap = {
  "h.spaces.subscribe": handleSubscribe,
  "h.spaces.unsubscribe": handleUnsubscribe,
};

declare module "@harmony/wasm" {
  type Subscription<T> = [T[], ReadableStream];

  export function subscribeSpaces(): Promise<Subscription<SpaceData>>;
  export function getSpaces(): Promise<SpaceData[]>;
}
