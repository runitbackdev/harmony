import type { Command, Request, Response, Stream } from "./base";

export type Session = {
  userId: string;
  deviceId: string;
  accessToken: string;
  refreshToken: string | null;
};

export type AuthLogin = Request<
  "h.auth.login",
  { username: string; password: string }
>;

export type AuthRestore = Request<"h.auth.restore", { session: Session }>;

export type AuthLogout = Command<"h.auth.logout">;

export type AuthLoginErrorCode =
  | "invalid_credentials"
  | "server_not_found"
  | "network"
  | "unknown";

export type AuthLoggedIn = Response<"h.auth.logged_in", { session: Session }>;

export type AuthError = Response<
  "h.auth.error",
  {
    code: AuthLoginErrorCode;
    message: string;
  }
>;

export type AuthTokenExpired = Stream<"h.auth.token_expired">;

export type AuthRequest = AuthLogin | AuthRestore;
export type AuthResponse = AuthLoggedIn | AuthError;
export type AuthCommand = AuthLogout;
