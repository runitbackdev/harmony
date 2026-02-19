import type { AuthLoginErrorCode } from "@harmony/protocol";
import type { HandlerFor, HandlerMap } from "../types";
import { login, logout, restoreSession } from "@harmony/wasm";

const HOMESERVER =
  import.meta.env.VITE_HOMESERVER_URL ?? "https://chat.lycanthropy.dev";

type WasmError = { code: string; message: string };

const MESSAGE_MAP: Record<
  string,
  { code: AuthLoginErrorCode; message: string }
> = {
  invalid_credentials: {
    code: "invalid_credentials",
    message: "Wrong username or password.",
  },
  server_not_found: {
    code: "server_not_found",
    message: "Could not reach the homeserver.",
  },
  rate_limited: {
    code: "network",
    message: "Too many requests. Please wait a moment.",
  },
};

const FALLBACK = {
  code: "unknown" as const,
  message: "Something went wrong. Please try again.",
};

function toAuthError(error: unknown): {
  code: AuthLoginErrorCode;
  message: string;
} {
  const wasmErr = error as WasmError;
  if (wasmErr?.code) {
    return MESSAGE_MAP[wasmErr.code] ?? FALLBACK;
  }
  return FALLBACK;
}

const handleLogin: HandlerFor<"h.auth.login"> = async (message, send) => {
  try {
    const session = await login({
      homeserver: HOMESERVER,
      ...message,
    });

    send.respond({
      type: "h.auth.logged_in",
      session,
    });
  } catch (error) {
    console.error("[auth] login failed:", error);
    const { code, message } = toAuthError(error);
    send.respond({ type: "h.auth.error", code, message });
  }
};

const handleRestore: HandlerFor<"h.auth.restore"> = async (message, send) => {
  const session = message.session;

  try {
    await restoreSession({
      homeserver: HOMESERVER,
      ...session,
    });

    send.respond({
      type: "h.auth.logged_in",
      session,
    });
  } catch (error) {
    console.error("[auth] restore failed:", error);
    const { code, message } = toAuthError(error);
    send.respond({ type: "h.auth.error", code, message });
  }
};

const handleLogout: HandlerFor<"h.auth.logout"> = async (_message, _send) => {
  await logout();
};

export const authHandlers: HandlerMap = {
  "h.auth.login": handleLogin,
  "h.auth.restore": handleRestore,
  "h.auth.logout": handleLogout,
};
