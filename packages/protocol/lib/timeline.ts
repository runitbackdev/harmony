import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type TimelineContent =
  | { type: "message"; body: string; msgtype: string }
  | { type: "membershipChange"; userId: string; change: string }
  | {
      type: "profileChange";
      displayNameChange: string | null;
      avatarUrlChange: string | null;
    }
  | { type: "state"; eventType: string }
  | { type: "virtual"; kind: string }
  | { type: "unknown" };

export type SendState =
  | { state: "notSentYet" }
  | { state: "sent" }
  | { state: "sendingFailed"; error: string; isRecoverable: boolean };

export type TimelineEvent = {
  id: string | null;
  sender: string | null;
  senderName: string | null;
  senderAvatar: string | null;
  timestamp: number;
  content: TimelineContent;
  sendState: SendState | null;
};

export type TimelineSubscribe = Request<
  "h.timeline.subscribe",
  { roomId: string }
>;
export type TimelineSubscribed = Response<
  "h.timeline.subscribed",
  { events: TimelineEvent[] }
>;
export type TimelineUnsubscribe = Command<
  "h.timeline.unsubscribe",
  { roomId: string }
>;

export type TimelineSend = Request<
  "h.timeline.send",
  { roomId: string; body: string }
>;
export type TimelineSent = Response<"h.timeline.sent", Record<string, never>>;

export type TimelineUpdate = Stream<
  "h.timeline.update",
  { roomId: string; events: ListDiff<TimelineEvent>[] }
>;

export type TimelineRequest = TimelineSubscribe | TimelineSend;
export type TimelineResponse = TimelineSubscribed | TimelineSent;
export type TimelineCommand = TimelineUnsubscribe;
export type TimelineStream = TimelineUpdate;
