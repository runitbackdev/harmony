export type SubscribableStore<T> = {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => T;
  set: (value: T) => void;
};

export function createStore<T>(initial: T): SubscribableStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    getSnapshot() {
      return value;
    },

    set(next) {
      value = next;
      listeners.forEach((l) => l());
    },
  };
}
