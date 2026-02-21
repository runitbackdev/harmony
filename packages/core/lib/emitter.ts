// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (data: any) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<string, Set<Listener>>();

  on<K extends keyof Events & string>(
    event: K,
    fn: (data: Events[K]) => void,
  ): () => void {
    let set = this.listeners.get(event);

    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof Events & string>(event: K, data: Events[K]): void {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(data);
  }
}
