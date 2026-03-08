import type { TimelineSubscribed } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type TimelineApi = {
  subscribe: (roomId: string) => Promise<TimelineSubscribed>;
  unsubscribe: (roomId: string) => void;
};

export function createTimelineApi(connection: WorkerConnection): TimelineApi {
  return {
    async subscribe(roomId: string) {
      return connection.request("h.timeline.subscribe", { roomId });
    },

    unsubscribe(roomId: string) {
      connection.command("h.timeline.unsubscribe", { roomId });
    },
  };
}
