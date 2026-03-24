import type { ChannelVisibility, RoomsCreated, RoomsSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type RoomsApi = {
  subscribe: (spaceId: string) => Promise<RoomsSubscribed>;
  unsubscribe: (spaceId: string) => void;
  create: (spaceId: string, name: string, visibility: ChannelVisibility) => Promise<RoomsCreated>;
};

export function createRoomsApi(connection: WorkerConnection): RoomsApi {
  return {
    async subscribe(spaceId: string) {
      return connection.request("h.rooms.subscribe", { spaceId });
    },

    unsubscribe(spaceId: string) {
      connection.command("h.rooms.unsubscribe", { spaceId });
    },

    async create(spaceId: string, name: string, visibility: ChannelVisibility) {
      return connection.request("h.rooms.create", { spaceId, name, visibility });
    },
  };
}
