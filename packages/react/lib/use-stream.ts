import { subscribe } from "@harmony/core/harmony";
import type {
  SubscriptionChunk,
  SubscriptionInitial,
  SubscriptionInput,
  SubscriptionName,
} from "@harmony/core/protocol/types";
import type { RpcResult } from "@harmony/core/transport";
import { useEffect, useState } from "react";

/**
 * Subscription hook returning raw initial + chunks list.
 *
 * For shaped streams (e.g. `ListDiff`) prefer `useListSubscription` which
 * applies a reducer to keep a derived value reactive.
 */
export function useStream<K extends SubscriptionName>(
  name: K,
  input: SubscriptionInput<K>,
): {
  status: "idle" | "ready" | "error";
  initial: SubscriptionInitial<K> | null;
  error: RpcResult<unknown> extends infer R
    ? R extends { ok: false; error: infer E }
      ? E | null
      : null
    : null;
  chunks: SubscriptionChunk<K>[];
} {
  const [state, setState] = useState<{
    status: "idle" | "ready" | "error";
    initial: SubscriptionInitial<K> | null;
    error: unknown;
    chunks: SubscriptionChunk<K>[];
  }>({ status: "idle", initial: null, error: null, chunks: [] });

  useEffect(() => {
    let alive = true;
    const handle = subscribe(name, input, (chunk) => {
      if (!alive) return;
      setState((prev) => ({ ...prev, chunks: [...prev.chunks, chunk] }));
    });
    handle.initial
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          setState((prev) => ({
            ...prev,
            status: "ready",
            initial: result.value,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: result.error,
          }));
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((prev) => ({ ...prev, status: "error", error: err }));
      });
    return () => {
      alive = false;
      handle.unsubscribe();
    };
    // input is intentionally tracked by reference; callers should stabilize
    // if they care about re-subscribing on equal inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, input]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return state as any;
}
