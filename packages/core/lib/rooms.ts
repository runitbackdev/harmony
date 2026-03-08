import type { RoomsSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type RoomsApi = {
  subscribe: (spaceId: string) => Promise<RoomsSubscribed>;
  unsubscribe: (spaceId: string) => void;
};

export function createRoomsApi(connection: WorkerConnection): RoomsApi {
  return {
    async subscribe(spaceId: string) {
      return connection.request("h.rooms.subscribe", { spaceId });
    },

    unsubscribe(spaceId: string) {
      connection.command("h.rooms.unsubscribe", { spaceId });
    },
  };
}
