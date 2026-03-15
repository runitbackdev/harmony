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
  let generation = 0;

  function start() {
    if (state.ready) return state.ready;

    const gen = ++generation;

    state.ready = subscribe(state.items).then((result) => {
      if (gen !== generation) return;
      state.items.splice(0, state.items.length, ...result.initial);
      cleanup = result.cleanup;
    });

    return state.ready;
  }

  function stop() {
    generation++;
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

type KeyedSubscriber<K, T> = (
  key: K,
  items: T[],
) => Promise<{
  initial: T[];
  cleanup: () => void;
}>;

export function createKeyedSubscription<K, T>(subscribe: KeyedSubscriber<K, T>) {
  const state = proxy({
    key: null as K | null,
    items: [] as T[],
    ready: null as Promise<void> | null,
  });

  let cleanup: (() => void) | null = null;
  let generation = 0;

  function stop() {
    generation++;
    cleanup?.();
    cleanup = null;
    state.items = [];
    state.key = null;
    state.ready = null;
  }

  function start(key: K) {
    if (state.key === key && state.ready) return state.ready;

    cleanup?.();
    cleanup = null;
    state.key = key;

    const gen = ++generation;

    state.ready = subscribe(key, state.items).then((result) => {
      if (gen !== generation) return;
      state.items.splice(0, state.items.length, ...result.initial);
      cleanup = result.cleanup;
    });

    return state.ready;
  }

  function useValue(): T[] {
    const snap = useSnapshot(state);
    return snap.items as T[];
  }

  return { state, start, stop, useValue };
}
