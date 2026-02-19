import type {
  AuthCommand,
  AuthError,
  AuthLoggedIn,
  AuthRequest,
  AuthResponse,
  AuthTokenExpired,
} from "./auth";
import type { ErrorResponse } from "./error";

export type * from "./base";
export type * from "./error";
export type * from "./auth";

export type ResponseMap = {
  "h.auth.login": AuthLoggedIn | AuthError;
  "h.auth.restore": AuthLoggedIn | AuthError;
};

export type CommandMessage = AuthCommand;
export type StreamMessage = AuthTokenExpired;

export type CommandKey = CommandMessage["type"];
export type WorkerInbound = AuthRequest | AuthCommand;
export type WorkerOutbound = ErrorResponse | AuthResponse;
