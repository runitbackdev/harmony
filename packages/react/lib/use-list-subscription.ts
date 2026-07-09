import { subscribe } from "@harmony/core/harmony";
import type {
  SubscriptionChunk,
  SubscriptionInitial,
  SubscriptionInput,
  SubscriptionName,
} from "@harmony/core/protocol/types";
import { useEffect, useMemo, useRef } from "react";
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

  // Callers pass `applyDiff` as an inline closure, so its identity changes
  // every render. Holding it in a ref keeps it out of the effect's deps —
  // otherwise the effect would resubscribe on every render, tearing down the
  // live stream and dropping in-flight diffs (e.g. send local echoes).
  const applyDiffRef = useRef(applyDiff);
  applyDiffRef.current = applyDiff;

  useEffect(() => {
    let alive = true;
    const pending: SubscriptionChunk<K>[] = [];

    const applyChunk = (chunk: SubscriptionChunk<K>) => {
      if (store.value == null) return;
      const next = applyDiffRef.current(store.value, chunk);
      if (next !== undefined) store.value = next;
    };

    // Chunks can arrive before `initial` resolves (the desktop transport
    // delivers buffered chunks a microtask ahead of the initial promise).
    // Diffs are relative to the initial snapshot, so hold them in order and
    // replay once it lands rather than dropping them.
    const handle = subscribe(name, input, (chunk) => {
      if (!alive) return;

      if (store.status !== "ready") {
        pending.push(chunk);
        return;
      }
      applyChunk(chunk);
    });
    handle.initial
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          store.value = result.value;
          store.status = "ready";
          for (const chunk of pending) applyChunk(chunk);
          pending.length = 0;
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
    // `applyDiff` is intentionally read through a ref, not depended on — the
    // subscription must outlive renders. See the ref note above.
  }, [store, name, input]);

  return useSnapshot(store) as {
    status: "idle" | "ready" | "error";
    value: SubscriptionInitial<K> | null;
    error: unknown;
  };
}
