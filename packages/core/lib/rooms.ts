import type {
  ChannelVisibility,
  MembersGot,
  MembersSubscribed,
  RoomsCreated,
  RoomsGotAll,
  RoomsGotIds,
  RoomsSubscribed,
} from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type RoomsApi = {
  subscribe: (spaceId: string) => Promise<RoomsSubscribed>;
  unsubscribe: (spaceId: string) => void;
  getIds: (spaceId: string) => Promise<RoomsGotIds>;
  getAll: () => Promise<RoomsGotAll>;
  create: (spaceId: string, name: string, visibility: ChannelVisibility) => Promise<RoomsCreated>;
  getMembers: (roomId: string) => Promise<MembersGot>;
  subscribeMembers: (roomId: string) => Promise<MembersSubscribed>;
  unsubscribeMembers: (roomId: string) => void;
};

export function createRoomsApi(connection: WorkerConnection): RoomsApi {
  return {
    async subscribe(spaceId: string) {
      return connection.request("h.rooms.subscribe", { spaceId });
    },

    unsubscribe(spaceId: string) {
      connection.command("h.rooms.unsubscribe", { spaceId });
    },

    async getIds(spaceId: string) {
      return connection.request("h.rooms.getIds", { spaceId });
    },

    async getAll() {
      return connection.request("h.rooms.getAll", {});
    },

    async create(spaceId: string, name: string, visibility: ChannelVisibility) {
      return connection.request("h.rooms.create", { spaceId, name, visibility });
    },

    async getMembers(roomId: string) {
      return connection.request("h.members.get", { roomId });
    },

    async subscribeMembers(roomId: string) {
      return connection.request("h.members.subscribe", { roomId });
    },

    unsubscribeMembers(roomId: string) {
      connection.command("h.members.unsubscribe", { roomId });
    },
  };
}
