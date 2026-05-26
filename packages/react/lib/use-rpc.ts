import { rpc } from "@harmony/core/harmony";
import type { RpcInput, RpcName, RpcOutput } from "@harmony/core/protocol/types";
import type { RpcResult } from "@harmony/core/transport";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

/**
 * Imperative bridge RPC binding for React. Backed by TanStack
 * `useMutation` so consumers get familiar `{ mutate, mutateAsync, status,
 * error, data, ... }` semantics. The `data` is the full {@link RpcResult}
 * so callers discriminate on `.ok` to distinguish success from a typed
 * `HarmonyError`.
 */
export function useRpc<K extends RpcName>(
  name: K,
): UseMutationResult<RpcResult<RpcOutput<K>>, Error, RpcInput<K>> {
  return useMutation({
    mutationKey: ["harmony.rpc", name],
    mutationFn: (input: RpcInput<K>) => rpc(name, input),
  });
}
