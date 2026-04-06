import type { AuthCommand, AuthError, AuthLoggedIn, AuthRequest, AuthResponse } from "./auth";
import type { ErrorResponse } from "./error";
import type {
  MembersGot,
  RoomsCommand,
  RoomsCreated,
  RoomsRequest,
  RoomsResponse,
  RoomsSubscribed,
  RoomsUpdate,
} from "./rooms";
import type {
  SpacesCommand,
  SpacesCreated,
  SpacesJoined,
  SpacesRequest,
  SpacesResponse,
  SpacesSubscribed,
  SpacesUpdate,
} from "./spaces";
import type { SyncCommand, SyncRequest, SyncResponse, SyncStarted, SyncStatus } from "./sync";
import type {
  TimelineCommand,
  TimelineEdited,
  TimelinePaginated,
  TimelineReactionToggled,
  TimelineMarkedAsRead,
  TimelineRedacted,
  TimelineRequest,
  TimelineResponse,
  TimelineSent,
  TimelineSubscribed,
  TimelineUpdate,
} from "./timeline";

export type * from "./base";
export type * from "./error";
export type * from "./auth";
export type * from "./sync";
export type * from "./spaces";
export type * from "./rooms";
export type * from "./timeline";
export type * from "./diff";
export { applyListDiff } from "./diff";

export type ResponseMap = {
  "h.auth.login": AuthLoggedIn | AuthError;
  "h.auth.restore": AuthLoggedIn | AuthError;
  "h.sync.start": SyncStarted;
  "h.spaces.subscribe": SpacesSubscribed;
  "h.spaces.create": SpacesCreated;
  "h.spaces.join": SpacesJoined;
  "h.rooms.subscribe": RoomsSubscribed;
  "h.rooms.create": RoomsCreated;
  "h.members.get": MembersGot;
  "h.timeline.subscribe": TimelineSubscribed;
  "h.timeline.send": TimelineSent;
  "h.timeline.edit": TimelineEdited;
  "h.timeline.toggleReaction": TimelineReactionToggled;
  "h.timeline.redact": TimelineRedacted;
  "h.timeline.paginate": TimelinePaginated;
  "h.timeline.markAsRead": TimelineMarkedAsRead;
};

export type CommandMessage =
  | AuthCommand
  | SyncCommand
  | SpacesCommand
  | RoomsCommand
  | TimelineCommand;

export type StreamMap = {
  "h.sync.status": SyncStatus;
  "h.spaces.update": SpacesUpdate;
  "h.rooms.update": RoomsUpdate;
  "h.timeline.update": TimelineUpdate;
};

export type StreamMessage = StreamMap[keyof StreamMap];

export type CommandKey = CommandMessage["type"];
export type WorkerInbound =
  | AuthRequest
  | AuthCommand
  | SyncRequest
  | SyncCommand
  | SpacesRequest
  | SpacesCommand
  | RoomsRequest
  | RoomsCommand
  | TimelineRequest
  | TimelineCommand;
export type WorkerOutbound =
  | ErrorResponse
  | AuthResponse
  | SyncResponse
  | SpacesResponse
  | RoomsResponse
  | TimelineResponse;
