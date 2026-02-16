import init from "@harmony/wasm";

declare let self: SharedWorkerGlobalScope;

let ready = false;

self.onconnect = async () => {
  if (!ready) {
    await init();

    ready = true;
  }
};
