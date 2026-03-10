import type { TimelineSent, TimelineSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type TimelineApi = {
  subscribe: (roomId: string) => Promise<TimelineSubscribed>;
  unsubscribe: (roomId: string) => void;
  send: (roomId: string, body: string) => Promise<TimelineSent>;
};

export function createTimelineApi(connection: WorkerConnection): TimelineApi {
  return {
    async subscribe(roomId: string) {
      return connection.request("h.timeline.subscribe", { roomId });
    },

    unsubscribe(roomId: string) {
      connection.command("h.timeline.unsubscribe", { roomId });
    },

    async send(roomId: string, body: string) {
      return connection.request("h.timeline.send", { roomId, body });
    },
  };
}
