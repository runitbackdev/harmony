import type { SpacesCreated, SpacesJoined, SpacesSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type SpacesApi = {
  subscribe: () => Promise<SpacesSubscribed>;
  unsubscribe: () => void;

  create: (name: string) => Promise<SpacesCreated>;
  join: (spaceId: string) => Promise<SpacesJoined>;
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

    async join(spaceId: string) {
      return connection.request("h.spaces.join", { spaceId });
    },
  };
}
