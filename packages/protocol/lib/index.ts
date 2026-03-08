import type {
  AuthCommand,
  AuthError,
  AuthLoggedIn,
  AuthRequest,
  AuthResponse,
} from "./auth";
import type { ErrorResponse } from "./error";
import type {
  RoomsCommand,
  RoomsRequest,
  RoomsResponse,
  RoomsSubscribed,
  RoomsUpdate,
} from "./rooms";
import type {
  SpacesCommand,
  SpacesCreated,
  SpacesRequest,
  SpacesResponse,
  SpacesSubscribed,
  SpacesUpdate,
} from "./spaces";
import type {
  SyncCommand,
  SyncRequest,
  SyncResponse,
  SyncStarted,
  SyncStatus,
} from "./sync";
import type {
  TimelineCommand,
  TimelineRequest,
  TimelineResponse,
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
  "h.rooms.subscribe": RoomsSubscribed;
  "h.timeline.subscribe": TimelineSubscribed;
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
