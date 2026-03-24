import type { Session } from "@harmony/protocol";
import type { WorkerConnection } from "./connection";
import { setSession, clearSession } from "./session";

export type AuthLoginResult =
  | { status: "ok"; session: Session }
  | { status: "error"; code: string; message: string };

export type AuthLogoutResult = { status: "ok" };

export type AuthApi = {
  login: (params: { username: string; password: string }) => Promise<AuthLoginResult>;
  restore: (session: Session) => Promise<AuthLoginResult>;
  logout: () => Promise<AuthLogoutResult>;
};

export function createAuthApi(connection: WorkerConnection): AuthApi {
  return {
    async login(params) {
      const response = await connection.request("h.auth.login", params);

      switch (response.type) {
        case "h.auth.logged_in": {
          setSession(response.session);
          return { status: "ok" as const, session: response.session };
        }
        case "h.auth.error": {
          return {
            status: "error" as const,
            code: response.code,
            message: response.message,
          };
        }
      }
    },

    async restore(session) {
      const response = await connection.request("h.auth.restore", { session });

      switch (response.type) {
        case "h.auth.logged_in": {
          setSession(response.session);
          return { status: "ok" as const, session: response.session };
        }
        case "h.auth.error": {
          return {
            status: "error" as const,
            code: response.code,
            message: response.message,
          };
        }
      }
    },

    async logout() {
      connection.command("h.auth.logout", {});
      await clearSession();

      return { status: "ok" as const };
    },
  };
}
