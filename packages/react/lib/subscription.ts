import { proxy, useSnapshot } from "valtio";

type Subscriber<T> = (items: T[]) => Promise<{
  initial: T[];
  cleanup: () => void;
}>;

export function createSubscription<T>(subscribe: Subscriber<T>) {
  const state = proxy({
    items: [] as T[],
    ready: null as Promise<void> | null,
  });

  let cleanup: (() => void) | null = null;

  function start() {
    if (state.ready) return state.ready;

    state.ready = subscribe(state.items).then((result) => {
      state.items.splice(0, state.items.length, ...result.initial);
      cleanup = result.cleanup;
    });

    return state.ready;
  }

  function stop() {
    cleanup?.();
    cleanup = null;
    state.items = [];
    state.ready = null;
  }

  function useValue(): T[] {
    const snap = useSnapshot(state);
    return snap.items as T[];
  }

  return { state, start, stop, useValue };
}
