import { subscribe } from "@harmony/core/harmony";
import type {
  SubscriptionChunk,
  SubscriptionInitial,
  SubscriptionInput,
  SubscriptionName,
} from "@harmony/core/protocol/types";
import { useEffect, useMemo } from "react";
import { proxy, useSnapshot } from "valtio";

/**
 * Generic list-shaped subscription primitive. Folds chunks into the
 * initial snapshot via a reducer the consumer supplies. Domain-specific
 * hooks (e.g. `useSpaces`) live in apps and wrap this with their concrete
 * `applyDiff`.
 */
export function useListSubscription<K extends SubscriptionName>(
  name: K,
  input: SubscriptionInput<K>,
  applyDiff: (
    state: SubscriptionInitial<K>,
    chunk: SubscriptionChunk<K>,
  ) => SubscriptionInitial<K> | void,
): {
  status: "idle" | "ready" | "error";
  value: SubscriptionInitial<K> | null;
  error: unknown;
} {
  const store = useMemo(
    () =>
      proxy<{
        status: "idle" | "ready" | "error";
        value: SubscriptionInitial<K> | null;
        error: unknown;
      }>({ status: "idle", value: null, error: null }),
    // store identity is bound to (name, input) lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, input],
  );

  useEffect(() => {
    let alive = true;
    const handle = subscribe(name, input, (chunk) => {
      if (!alive || store.value == null) return;
      const next = applyDiff(store.value, chunk);
      if (next !== undefined) store.value = next;
    });
    handle.initial
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          store.value = result.value;
          store.status = "ready";
        } else {
          store.error = result.error;
          store.status = "error";
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        store.error = err;
        store.status = "error";
      });
    return () => {
      alive = false;
      handle.unsubscribe();
    };
  }, [store, name, input, applyDiff]);

  return useSnapshot(store) as {
    status: "idle" | "ready" | "error";
    value: SubscriptionInitial<K> | null;
    error: unknown;
  };
}
