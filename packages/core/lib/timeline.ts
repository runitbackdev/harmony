import type { TimelinePaginated, TimelineSent, TimelineSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type TimelineApi = {
  subscribe: (roomId: string) => Promise<TimelineSubscribed>;
  unsubscribe: (roomId: string) => void;
  send: (roomId: string, body: string, formattedBody?: string) => Promise<TimelineSent>;
  paginate: (roomId: string, count: number) => Promise<TimelinePaginated>;
};

export function createTimelineApi(connection: WorkerConnection): TimelineApi {
  return {
    async subscribe(roomId: string) {
      return connection.request("h.timeline.subscribe", { roomId });
    },

    unsubscribe(roomId: string) {
      connection.command("h.timeline.unsubscribe", { roomId });
    },

    async send(roomId: string, body: string, formattedBody?: string) {
      return connection.request("h.timeline.send", { roomId, body, formattedBody });
    },

    async paginate(roomId: string, count: number) {
      return connection.request("h.timeline.paginate", { roomId, count });
    },
  };
}
