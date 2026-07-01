import { invoke } from "@tauri-apps/api/core";

import type { HarmonyError, RpcResult } from "../index";

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
