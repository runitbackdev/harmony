import type { RoomWithSpaceSummary } from "@harmony/protocol";
import { proxy, subscribe, useSnapshot } from "valtio";
import type { Command, OmnibarItemKind } from "../types";

export type RecentEntry = {
  id: string;
  kind: OmnibarItemKind;
  ts: number;
};

const STORAGE_KEY = "harmony.omnibar.recents";
const CAP = 50;
const DEBOUNCE_MS = 500;

function isValidEntry(x: unknown): x is RecentEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.kind === "string" && typeof e.ts === "number";
}

function load() {
  const empty: RecentEntry[] = [];
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty;
    return parsed.filter(isValidEntry).slice(0, CAP);
  } catch {
    return empty;
  }
}

const state = proxy<{ entries: RecentEntry[] }>({ entries: load() });

let writeTimer: number | null = null;
subscribe(state, () => {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch {
      // localStorage unavailable (private mode / quota); recents stay in-memory.
    }
    writeTimer = null;
  }, DEBOUNCE_MS);
});

export function recordRecent(entry: { id: string; kind: OmnibarItemKind }) {
  const existing = state.entries.findIndex(
    (e) => e.id === entry.id && e.kind === entry.kind,
  );
  if (existing >= 0) state.entries.splice(existing, 1);
  state.entries.unshift({ id: entry.id, kind: entry.kind, ts: Date.now() });
  if (state.entries.length > CAP) state.entries.length = CAP;
}

export function clearRecents() {
  state.entries.length = 0;
}

export function useRecents() {
  return useSnapshot(state).entries;
}

export function hydrateRecent(
  entry: RecentEntry,
  commands: readonly Command[],
  rooms: readonly RoomWithSpaceSummary[],
) {
  switch (entry.kind) {
    case "command": {
      const command = commands.find((c) => c.id === entry.id);
      return command ? { kind: "command" as const, command } : null;
    }
    case "room": {
      const room = rooms.find((r) => r.roomId === entry.id);
      return room ? { kind: "room" as const, room } : null;
    }
  }
}
