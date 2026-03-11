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

function isWasmError(error: unknown): error is WasmError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as WasmError).code === "string"
  );
}

function toAuthError(error: unknown): {
  code: AuthLoginErrorCode;
  message: string;
} {
  if (isWasmError(error)) {
    return MESSAGE_MAP[error.code] ?? FALLBACK;
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

async function deleteDatabase(name: string) {
  const request = indexedDB.deleteDatabase(name);

  return new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const handleLogout: HandlerFor<"h.auth.logout"> = async () => {
  await logout();

  const databases = await indexedDB.databases();

  const results = await Promise.allSettled(
    databases
      .map((db) => db.name)
      .filter((name): name is string => name !== undefined)
      .map(deleteDatabase),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[auth] failed to delete database:", result.reason);
    }
  }
};

export const authHandlers: HandlerMap = {
  "h.auth.login": handleLogin,
  "h.auth.restore": handleRestore,
  "h.auth.logout": handleLogout,
};
