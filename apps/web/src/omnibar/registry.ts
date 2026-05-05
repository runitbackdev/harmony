import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Command } from "./types";

class CommandRegistry {
  private commands = new Map<string, Command>();
  private subscribers = new Set<() => void>();
  private cached: readonly Command[] | null = null;

  register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.invalidate();
    return () => this.unregister(command.id);
  }

  unregister(id: string): void {
    if (this.commands.delete(id)) this.invalidate();
  }

  /** Stable array reference until the next register/unregister. */
  all(): readonly Command[] {
    if (this.cached === null) {
      this.cached = Array.from(this.commands.values());
    }
    return this.cached;
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private invalidate(): void {
    this.cached = null;
    for (const fn of this.subscribers) fn();
  }
}

export const registry = new CommandRegistry();

/** Subscribe to all registered commands. Re-renders on register/unregister.
 *  Does not apply `when()` gating — that's a pipeline concern downstream. */
export function useAllCommands(): readonly Command[] {
  return useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.all(),
    () => registry.all(),
  );
}

/** Register a list of commands for the lifetime of the calling component.
 *  Re-registers when the set of ids changes, or when any value in `deps`
 *  changes — pass anything `perform` (or other fields) close over, the same
 *  way you'd populate a `useEffect` dep array. Without `deps`, closures are
 *  captured once at registration and won't see updated values. */
export function useOmnibarCommands(
  commands: readonly Command[],
  deps: readonly unknown[] = [],
): void {
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const idsKey = commands.map((c) => c.id).join("\0");
  const effectDeps = [idsKey, ...deps];

  useEffect(() => {
    const unregisters = commandsRef.current.map((cmd) => registry.register(cmd));
    return () => {
      for (const u of unregisters) u();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, effectDeps);
}
