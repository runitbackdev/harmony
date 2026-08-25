import { Channel, invoke } from "@tauri-apps/api/core";

import type { HarmonyError, RpcResult } from "@harmony/core/transport";

/**
 * Thin wrappers around Tauri's `invoke` that match the `RpcFn` / `CommandFn`
 * shapes in `maps.generated.ts`. Every wrapper fn emitted by
 * `#[harmony_export]` takes 0 or 1 input projected into a single `input`
 * parameter, so the JSON payload is uniformly `{ input }`.
 *
 * The Rust wrapper returns `Rpc<T>` / `Command` which serialize to
 * `{ ok: true, value: T }` / `{ ok: true }` (or `{ ok: false, error }`),
 * matching the existing transport-agnostic `RpcResult<T>` shape.
 */
export async function invokeRpc<I, O>(tauriCmd: string, input: I): Promise<RpcResult<O>> {
  return (await invoke(tauriCmd, { input })) as RpcResult<O>;
}

export async function invokeCommand<I>(
  tauriCmd: string,
  input: I,
): Promise<{ ok: true } | { ok: false; error: HarmonyError }> {
  return (await invoke(tauriCmd, { input })) as { ok: true } | { ok: false; error: HarmonyError };
}

/**
 * Byte-bearing RPC. Tauri's response body is `Json` XOR `Raw`, so a payload
 * carrying `Bytes` would degrade to a JSON number array. The Rust wrapper
 * instead moves that field out and pushes it down a `Channel` as raw bytes,
 * returning the rest as normal JSON; this reassembles the two so callers see
 * the same shape as every other target.
 */
export async function invokeRpcBytesOut<I, O>(
  tauriCmd: string,
  input: I,
  field: string,
): Promise<RpcResult<O>> {
  const bytes = new Channel<ArrayBuffer>();
  const transferred = new Promise<ArrayBuffer>((resolve) => {
    bytes.onmessage = resolve;
  });

  const result = (await invoke(tauriCmd, { input, bytes })) as RpcResult<O>;
  if (!result.ok) return result;

  return { ok: true, value: { ...result.value, [field]: new Uint8Array(await transferred) } as O };
}

/**
 * Byte-bearing RPC input. The declared field rides the raw request body and
 * the rest of the input goes as JSON in a header, since Tauri's request body
 * is `Json` XOR `Raw`. The field travels as an empty array in that header so
 * the Rust side deserializes the wire type intact before overwriting it.
 */
export async function invokeRpcBytesIn<I, O>(
  tauriCmd: string,
  input: I,
  field: string,
): Promise<RpcResult<O>> {
  const { [field]: raw, ...rest } = input as I & Record<string, Uint8Array>;
  return (await invoke(tauriCmd, raw, {
    headers: { "x-harmony-input": JSON.stringify({ ...rest, [field]: [] }) },
  })) as RpcResult<O>;
}
