import type { WorkerInbound } from "@harmony/protocol";
import { createDispatcher } from "./dispatcher";
import { PortRegistry } from "./ports";
import { authHandlers } from "./handlers/auth";
import { spacesHandlers, removeSpacesSubscriber } from "./handlers/spaces";
import { syncHandlers, removeSyncSubscriber } from "./handlers/sync";
import init, { configureTracing, stopSync } from "@harmony/wasm";

declare let self: SharedWorkerGlobalScope;

const ports = new PortRegistry();

const dispatch = createDispatcher(
  {
    ...authHandlers,
    ...syncHandlers,
    ...spacesHandlers,
  },
  ports,
);

ports.onPortRemoved((port) => {
  removeSyncSubscriber(port);
  removeSpacesSubscriber(port);
});

ports.onAllDisconnected(() => {
  stopSync().catch(() => {});
});

const LOG_LEVEL = "warn";

let initialized = false;

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.add(port);

  port.onmessage = async (event: MessageEvent) => {
    if (event.data.type === "h.connection.close") {
      ports.remove(port);
      return;
    }

    if (!initialized) {
      await init();
      configureTracing(LOG_LEVEL);
      initialized = true;
    }

    await dispatch(port, event.data as WorkerInbound);
  };

  port.start();
};
