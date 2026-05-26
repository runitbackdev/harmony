/**
 * Host-agnostic transport seam for the Harmony bridge. Adapters
 * (SharedWorker, future Tauri/RN) implement {@link Transport}; the typed
 * {@link HarmonyClient} layered on top of these calls handles type
 * inference from the generated maps.
 */

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: HarmonyError };

export type HarmonyError = {
  code: string;
  message?: string;
  [extra: string]: unknown;
};

export type StreamHandle<I> = {
  initial: Promise<RpcResult<I>>;
  unsubscribe: () => void;
};

export interface Transport {
  request(name: string, input: unknown): Promise<RpcResult<unknown>>;
  command(name: string, input: unknown): void;
  subscribe(name: string, input: unknown, onChunk: (chunk: unknown) => void): StreamHandle<unknown>;
  dispose(): void;
}

// --- Wire shapes (kept internal-ish; consumers use the Transport API) ---

export type BridgeRequest = {
  kind: "request";
  id: string;
  name: string;
  input: unknown;
};

export type BridgeCommand = {
  kind: "command";
  name: string;
  input: unknown;
};

export type BridgeSubscribe = {
  kind: "subscribe";
  id: string;
  name: string;
  input: unknown;
};

export type BridgeUnsubscribe = {
  kind: "unsubscribe";
  id: string;
};

export type BridgeClose = {
  kind: "connection.close";
};

export type BridgeInbound =
  | BridgeRequest
  | BridgeCommand
  | BridgeSubscribe
  | BridgeUnsubscribe
  | BridgeClose;

export type BridgeResponse = {
  kind: "response";
  id: string;
  result: RpcResult<unknown>;
};

export type BridgeChunk = {
  kind: "chunk";
  id: string;
  chunk: unknown;
};

export type BridgeOutbound = BridgeResponse | BridgeChunk;

export function isBridgeInbound(value: unknown): value is BridgeInbound {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "request" ||
    kind === "command" ||
    kind === "subscribe" ||
    kind === "unsubscribe" ||
    kind === "connection.close"
  );
}

export function isBridgeOutbound(value: unknown): value is BridgeOutbound {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "response" || kind === "chunk";
}
