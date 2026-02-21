import type { SpacesSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type SpacesApi = {
  subscribe: () => Promise<SpacesSubscribed>;
  unsubscribe: () => void;
};

export function createSpacesApi(connection: WorkerConnection): SpacesApi {
  return {
    async subscribe() {
      return connection.request("h.spaces.subscribe", {});
    },

    unsubscribe() {
      connection.command("h.spaces.unsubscribe", {});
    },
  };
}
