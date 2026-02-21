import type { WorkerConnection } from "./connection";

export type SyncApi = {
  start: () => Promise<void>;
  stop: () => void;
};

export function createSyncApi(connection: WorkerConnection): SyncApi {
  return {
    async start() {
      await connection.request("h.sync.start", {});
    },

    stop() {
      connection.command("h.sync.stop", {});
    },
  };
}
