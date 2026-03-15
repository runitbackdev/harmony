import type { HandlerFor, HandlerMap } from "../types";
import { pipe } from "../pipe";
import { startSync, stopSync } from "@harmony/wasm";

const syncPorts = new Set<MessagePort>();
let statusReader: ReadableStreamDefaultReader | null = null;
let lastStatus: unknown = null;

function cancelStream() {
  statusReader?.cancel().catch(() => {});
  statusReader = null;
  lastStatus = null;
}

const handleStart: HandlerFor<"h.sync.start"> = async (_message, send) => {
  syncPorts.add(send.port);

  if (syncPorts.size > 1) {
    send.respond({ type: "h.sync.started" });
    if (lastStatus != null) send.port.postMessage({ type: "h.sync.status", status: lastStatus });
    return;
  }

  const statusStream = await startSync();
  statusReader = statusStream.getReader();
  send.respond({ type: "h.sync.started" });

  void pipe(statusReader, (status) => {
    lastStatus = status;
    send.broadcast({ type: "h.sync.status", status });
  });
};

const handleStop: HandlerFor<"h.sync.stop"> = async (_message, send) => {
  syncPorts.delete(send.port);

  if (syncPorts.size === 0) {
    cancelStream();
    await stopSync();
  }
};

export function removeSyncSubscriber(port: MessagePort) {
  syncPorts.delete(port);

  if (syncPorts.size === 0) {
    cancelStream();
    void stopSync();
  }
}

export const syncHandlers: HandlerMap = {
  "h.sync.start": handleStart,
  "h.sync.stop": handleStop,
};
