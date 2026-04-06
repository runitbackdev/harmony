import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type TimelineContent =
  | {
      type: "message";
      body: string;
      formattedBody?: string;
      msgtype: string;
      mentions?: { everyone: boolean; userIds: string[] };
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
};

export type TimelineSubscribe = Request<"h.timeline.subscribe", { roomId: string }>;
export type TimelineSubscribed = Response<"h.timeline.subscribed", { events: TimelineEvent[] }>;
export type TimelineUnsubscribe = Command<"h.timeline.unsubscribe", { roomId: string }>;

export type TimelineSend = Request<
  "h.timeline.send",
  { roomId: string; body: string; formattedBody?: string }
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

export type TimelinePaginate = Request<"h.timeline.paginate", { roomId: string; count: number }>;
export type TimelinePaginated = Response<"h.timeline.paginated", { hitStart: boolean }>;

export type TimelineMarkAsRead = Request<"h.timeline.markAsRead", { roomId: string }>;
export type TimelineMarkedAsRead = Response<"h.timeline.markedAsRead">;

export type TimelineUpdate = Stream<
  "h.timeline.update",
  { roomId: string; events: ListDiff<TimelineEvent>[] }
>;

export type TimelineRequest =
  | TimelineSubscribe
  | TimelineSend
  | TimelineEdit
  | TimelineToggleReaction
  | TimelineRedact
  | TimelinePaginate
  | TimelineMarkAsRead;
export type TimelineResponse =
  | TimelineSubscribed
  | TimelineSent
  | TimelineEdited
  | TimelineReactionToggled
  | TimelineRedacted
  | TimelinePaginated
  | TimelineMarkedAsRead;
export type TimelineCommand = TimelineUnsubscribe;
export type TimelineStream = TimelineUpdate;
