import { proxy, subscribe, useSnapshot } from "valtio";
import type { OmnibarItem, OmnibarItemKind } from "../types";

export type FrequencyEntry = {
  kind: OmnibarItemKind;
  count: number;
  lastUsed: number;
};

const STORAGE_KEY = "harmony.omnibar.frequencies";
const DEBOUNCE_MS = 500;

const ONE_MIN_MS = 60_000;
const THIRTY_MIN_MS = 30 * ONE_MIN_MS;
const ONE_DAY_MS = 24 * 60 * ONE_MIN_MS;
const TAIL_HALF_LIFE_MS = 7 * ONE_DAY_MS;

function makeKey(kind: OmnibarItemKind, id: string) {
  return `${kind}:${id}`;
}

function isValidEntry(x: unknown): x is FrequencyEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.kind === "string" && typeof e.count === "number" && typeof e.lastUsed === "number"
  );
}

function load() {
  const empty: Record<string, FrequencyEntry> = {};
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return empty;
    const out: Record<string, FrequencyEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidEntry(v)) out[k] = v;
    }
    return out;
  } catch {
    return empty;
  }
}

const state = proxy<{ entries: Record<string, FrequencyEntry> }>({ entries: load() });

let writeTimer: number | null = null;
subscribe(state, () => {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch {
      // localStorage unavailable (private mode / quota); frequencies stay in-memory.
    }
    writeTimer = null;
  }, DEBOUNCE_MS);
});

export function recordFrequency(entry: { id: string; kind: OmnibarItemKind }) {
  const k = makeKey(entry.kind, entry.id);
  const existing = state.entries[k];
  state.entries[k] = {
    kind: entry.kind,
    count: (existing?.count ?? 0) + 1,
    lastUsed: Date.now(),
  };
}

export function clearFrequencies() {
  for (const k of Object.keys(state.entries)) delete state.entries[k];
}

export function useFrequencies() {
  return useSnapshot(state).entries;
}

export function getFrequencyEntry(
  frequencies: Readonly<Record<string, FrequencyEntry>>,
  item: OmnibarItem,
) {
  const id = item.kind === "command" ? item.command.id : item.room.roomId;
  return frequencies[makeKey(item.kind, id)];
}

/**
 * Piecewise: 0.15 flat under 60s; linear 0.15→0.08 to 30min;
 * exp decay 0.08→0.03 to 24h; exp tail with 7-day half-life.
 */
export function recencyBoost(lastUsedMs: number) {
  const dt = Date.now() - lastUsedMs;
  if (dt < ONE_MIN_MS) return 0.15;
  if (dt < THIRTY_MIN_MS) {
    const t = (dt - ONE_MIN_MS) / (THIRTY_MIN_MS - ONE_MIN_MS);
    return 0.15 - t * (0.15 - 0.08);
  }
  if (dt < ONE_DAY_MS) {
    const t = (dt - THIRTY_MIN_MS) / (ONE_DAY_MS - THIRTY_MIN_MS);
    return 0.08 * Math.exp(-t * Math.log(0.08 / 0.03));
  }
  const tail = dt - ONE_DAY_MS;
  return 0.03 * Math.pow(0.5, tail / TAIL_HALF_LIFE_MS);
}

/** Log scale, lifetime count. Caps at 0.15 around count≈1000. */
export function frequencyBoost(count: number) {
  return Math.min(0.15, 0.05 * Math.log10(1 + count));
}
