import init, { configureTracing } from "@harmony/wasm";
import { createWorkerDispatcher } from "../transport/worker-dispatcher";
import { isBridgeInbound } from "../transport";

declare let self: SharedWorkerGlobalScope;

const LOG_LEVEL = "warn";

const bridge = createWorkerDispatcher();
const ports = new Set<MessagePort>();

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await init();
  configureTracing(LOG_LEVEL);
  initialized = true;
}

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.add(port);

  port.onmessage = async (event: MessageEvent) => {
    const data = event.data as unknown;

    if (!isBridgeInbound(data)) {
      console.warn("[worker] dropping non-bridge message:", data);
      return;
    }

    if (data.kind === "connection.close") {
      bridge.onPortClose(port);
      ports.delete(port);
      return;
    }

    await ensureInitialized();
    await bridge.onMessage(port, data);
  };

  port.start();
};
