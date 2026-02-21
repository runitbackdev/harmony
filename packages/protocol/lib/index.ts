import type {
  AuthCommand,
  AuthError,
  AuthLoggedIn,
  AuthRequest,
  AuthResponse,
} from "./auth";
import type { ErrorResponse } from "./error";
import type {
  SpacesCommand,
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

export type * from "./base";
export type * from "./error";
export type * from "./auth";
export type * from "./sync";
export type * from "./spaces";
export type * from "./diff";
export { applyListDiff } from "./diff";

export type ResponseMap = {
  "h.auth.login": AuthLoggedIn | AuthError;
  "h.auth.restore": AuthLoggedIn | AuthError;
  "h.sync.start": SyncStarted;
  "h.spaces.subscribe": SpacesSubscribed;
};

export type CommandMessage = AuthCommand | SyncCommand | SpacesCommand;

export type StreamMap = {
  "h.sync.status": SyncStatus;
  "h.spaces.update": SpacesUpdate;
};

export type StreamMessage = StreamMap[keyof StreamMap];

export type CommandKey = CommandMessage["type"];
export type WorkerInbound =
  | AuthRequest
  | AuthCommand
  | SyncRequest
  | SyncCommand
  | SpacesRequest
  | SpacesCommand;
export type WorkerOutbound =
  | ErrorResponse
  | AuthResponse
  | SyncResponse
  | SpacesResponse;
