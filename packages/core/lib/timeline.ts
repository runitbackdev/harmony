import type {
  TimelineEdited,
  TimelineMarkedAsRead,
  TimelinePaginated,
  TimelineReactionToggled,
  TimelineRedacted,
  TimelineSent,
  TimelineSubscribed,
} from "@harmony/protocol";
import type { WorkerConnection } from "./connection";

export type EditTarget = {
  eventId?: string;
  transactionId?: string;
};

export type TimelineApi = {
  subscribe: (roomId: string) => Promise<TimelineSubscribed>;
  unsubscribe: (roomId: string) => void;
  send: (roomId: string, body: string, formattedBody?: string) => Promise<TimelineSent>;
  edit: (
    roomId: string,
    target: EditTarget,
    body: string,
    formattedBody?: string,
  ) => Promise<TimelineEdited>;
  toggleReaction: (
    roomId: string,
    target: EditTarget,
    key: string,
  ) => Promise<TimelineReactionToggled>;
  redact: (roomId: string, target: EditTarget) => Promise<TimelineRedacted>;
  paginate: (roomId: string, count: number) => Promise<TimelinePaginated>;
  markAsRead: (roomId: string) => Promise<TimelineMarkedAsRead>;
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

    async edit(roomId: string, target: EditTarget, body: string, formattedBody?: string) {
      return connection.request("h.timeline.edit", { roomId, ...target, body, formattedBody });
    },

    async toggleReaction(roomId: string, target: EditTarget, key: string) {
      return connection.request("h.timeline.toggleReaction", { roomId, ...target, key });
    },

    async redact(roomId: string, target: EditTarget) {
      return connection.request("h.timeline.redact", { roomId, ...target });
    },

    async paginate(roomId: string, count: number) {
      return connection.request("h.timeline.paginate", { roomId, count });
    },

    async markAsRead(roomId: string) {
      return connection.request("h.timeline.markAsRead", { roomId });
    },
  };
}
