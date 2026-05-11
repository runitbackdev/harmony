import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type TimelineContent =
  | {
      type: "message";
      body: string;
      formattedBody?: string;
      msgtype: string;
      mentions?: { everyone: boolean; userIds: string[] };
      edited: boolean;
    }
  | { type: "membershipChange"; userId: string; change: string }
  | {
      type: "profileChange";
      displayNameChange: string | null;
      avatarUrlChange: string | null;
    }
  | { type: "state"; eventType: string }
  | { type: "virtual"; kind: string }
  | { type: "unknown" };

export type ReactionGroup = {
  key: string;
  count: number;
  senders: string[];
  pending: boolean;
};

export type SendState =
  | { state: "notSentYet" }
  | { state: "sent" }
  | { state: "sendingFailed"; error: string; isRecoverable: boolean };

export type ReplyTarget = {
  eventId: string;
  sender: string | null;
  senderName: string | null;
  body: string | null;
  redacted: boolean;
};

export type TimelineEvent = {
  id: string | null;
  transactionId: string | null;
  sender: string | null;
  senderName: string | null;
  senderAvatar: string | null;
  timestamp: number;
  content: TimelineContent;
  sendState: SendState | null;
  reactions: ReactionGroup[] | null;
  replyTo: ReplyTarget | null;
};

export type TimelineMode = "live" | "detached";

export type PaginationDirection = "forward" | "backward";

export type TimelineStreamMessage =
  | { kind: "diffs"; generation: number; diffs: ListDiff<TimelineEvent>[] }
  | { kind: "error"; message: string };

export type TimelineSubscribe = Request<"h.timeline.subscribe", { roomId: string }>;
export type TimelineSubscribed = Response<
  "h.timeline.subscribed",
  { events: TimelineEvent[]; mode: TimelineMode; generation: number }
>;
export type TimelineUnsubscribe = Command<"h.timeline.unsubscribe", { roomId: string }>;

export type TimelineFocusOnEvent = Request<
  "h.timeline.focusOnEvent",
  { roomId: string; targetEventId: string; numContextEvents?: number }
>;
export type TimelineFocusedOnEvent = Response<
  "h.timeline.focusedOnEvent",
  { events: TimelineEvent[]; mode: TimelineMode; generation: number }
>;

export type TimelineReturnToLive = Request<"h.timeline.returnToLive", { roomId: string }>;
export type TimelineReturnedToLive = Response<
  "h.timeline.returnedToLive",
  { events: TimelineEvent[]; mode: TimelineMode; generation: number }
>;

export type TimelineSend = Request<
  "h.timeline.send",
  { roomId: string; body: string; formattedBody?: string; replyToEventId?: string }
>;
export type TimelineSent = Response<"h.timeline.sent">;

export type TimelineEdit = Request<
  "h.timeline.edit",
  { roomId: string; eventId?: string; transactionId?: string; body: string; formattedBody?: string }
>;
export type TimelineEdited = Response<"h.timeline.edited">;

export type TimelineToggleReaction = Request<
  "h.timeline.toggleReaction",
  { roomId: string; eventId?: string; transactionId?: string; key: string }
>;
export type TimelineReactionToggled = Response<"h.timeline.reactionToggled", { added: boolean }>;

export type TimelineRedact = Request<
  "h.timeline.redact",
  { roomId: string; eventId?: string; transactionId?: string }
>;
export type TimelineRedacted = Response<"h.timeline.redacted">;

export type TimelinePaginate = Request<
  "h.timeline.paginate",
  { roomId: string; direction: PaginationDirection; count: number }
>;
export type TimelinePaginated = Response<
  "h.timeline.paginated",
  {
    exhausted: boolean;
    mode: TimelineMode;
    events?: TimelineEvent[];
    generation?: number;
  }
>;

export type TimelineMarkAsRead = Request<"h.timeline.markAsRead", { roomId: string }>;
export type TimelineMarkedAsRead = Response<"h.timeline.markedAsRead">;

export type TimelineUpdate = Stream<
  "h.timeline.update",
  { roomId: string; message: TimelineStreamMessage }
>;

export type TimelineRequest =
  | TimelineSubscribe
  | TimelineFocusOnEvent
  | TimelineReturnToLive
  | TimelineSend
  | TimelineEdit
  | TimelineToggleReaction
  | TimelineRedact
  | TimelinePaginate
  | TimelineMarkAsRead;
export type TimelineResponse =
  | TimelineSubscribed
  | TimelineFocusedOnEvent
  | TimelineReturnedToLive
  | TimelineSent
  | TimelineEdited
  | TimelineReactionToggled
  | TimelineRedacted
  | TimelinePaginated
  | TimelineMarkedAsRead;
export type TimelineCommand = TimelineUnsubscribe;
export type TimelineStream = TimelineUpdate;
