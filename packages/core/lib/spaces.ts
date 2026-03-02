import type { SpacesCreated, SpacesSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type SpacesApi = {
  subscribe: () => Promise<SpacesSubscribed>;
  unsubscribe: () => void;

  create: (name: string) => Promise<SpacesCreated>;
};

export function createSpacesApi(connection: WorkerConnection): SpacesApi {
  return {
    async subscribe() {
      return connection.request("h.spaces.subscribe", {});
    },

    unsubscribe() {
      connection.command("h.spaces.unsubscribe", {});
    },

    async create(name: string) {
      return connection.request("h.spaces.create", { name });
    },
  };
}
