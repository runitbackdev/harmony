import type { WorkerInbound } from "@harmony/protocol";
import { createDispatcher } from "./dispatcher";
import { authHandlers } from "./handlers/auth";
import init from "@harmony/wasm";

declare let self: SharedWorkerGlobalScope;

const dispatch = createDispatcher({
  ...authHandlers,
});

let initialized = false;

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];

  port.onmessage = async (event: MessageEvent<WorkerInbound>) => {
    if (!initialized) {
      await init();

      initialized = true;
    }

    await dispatch(port, event.data);
  };

  port.start();
};
