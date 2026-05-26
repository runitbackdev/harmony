import { proxy, subscribe, useSnapshot, type Snapshot } from "valtio";
import type { OmnibarItem, OmnibarItemKind } from "../types";
import { recencyBoost, type FrequencyEntry } from "./frequencies";

export type Selection = {
  count: number;
  visits: number[];
};

export type QueryEntry = {
  lastTouched: number;
  items: Record<string, Selection>;
};

const STORAGE_KEY = "harmony.omnibar.queryLearning";
const DEBOUNCE_MS = 500;
const QUERY_CAP = 100;
const ITEMS_PER_QUERY_CAP = 20;
const VISITS_CAP = 10;
const NORMALIZE_CAP = 1000;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const ONE_MONTH_MS = 30 * ONE_DAY_MS;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

function makeKey(kind: OmnibarItemKind, id: string) {
  return `${kind}:${id}`;
}

function itemIdOf(item: OmnibarItem) {
  return item.kind === "command" ? item.command.id : item.room.roomId;
}

function bucketPoints(ageMs: number) {
  if (ageMs < 4 * ONE_HOUR_MS) return 100;
  if (ageMs < ONE_DAY_MS) return 80;
  if (ageMs < 3 * ONE_DAY_MS) return 60;
  if (ageMs < ONE_WEEK_MS) return 40;
  if (ageMs < ONE_MONTH_MS) return 20;
  if (ageMs < NINETY_DAYS_MS) return 10;
  return 0;
}

function slackScore(selection: Snapshot<Selection>, now: number) {
  if (selection.visits.length === 0) return 0;
  let total = 0;
  for (const t of selection.visits) total += bucketPoints(now - t);
  const mean = total / selection.visits.length;
  return selection.count * mean;
}

function normalize(score: number) {
  if (score <= 0) return 0;
  return Math.min(1, Math.log10(1 + score) / Math.log10(1 + NORMALIZE_CAP));
}

function isValidSelection(x: unknown): x is Selection {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.count === "number" &&
    Array.isArray(s.visits) &&
    s.visits.every((v) => typeof v === "number")
  );
}

function isValidEntry(x: unknown): x is QueryEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  if (typeof e.lastTouched !== "number") return false;
  if (typeof e.items !== "object" || e.items === null) return false;
  return Object.values(e.items).every(isValidSelection);
}

function load() {
  const empty: Record<string, QueryEntry> = {};
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return empty;
    const out: Record<string, QueryEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidEntry(v)) out[k] = v;
    }
    return out;
  } catch {
    return empty;
  }
}

const state = proxy<{ queries: Record<string, QueryEntry> }>({ queries: load() });

let writeTimer: number | null = null;
subscribe(state, () => {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.queries));
    } catch {
      // localStorage unavailable (private mode / quota).
    }
    writeTimer = null;
  }, DEBOUNCE_MS);
});

function evictLRUIfNeeded() {
  const keys = Object.keys(state.queries);
  if (keys.length <= QUERY_CAP) return;
  let oldestKey = keys[0];
  let oldestTs = state.queries[oldestKey].lastTouched;
  for (const k of keys) {
    if (state.queries[k].lastTouched < oldestTs) {
      oldestKey = k;
      oldestTs = state.queries[k].lastTouched;
    }
  }
  delete state.queries[oldestKey];
}

/** Bound items per query. Evicts the weakest selection (lowest count,
 *  with oldest most-recent-visit as tiebreaker) once over cap. Without this,
 *  a heavily used query accumulates a Selection per item ever picked and
 *  the entry grows forever in localStorage. */
function evictItemsIfNeeded(entry: QueryEntry) {
  const keys = Object.keys(entry.items);
  if (keys.length <= ITEMS_PER_QUERY_CAP) return;
  let worstKey = keys[0];
  let worst = entry.items[worstKey];
  for (const k of keys) {
    const s = entry.items[k];
    const sLastVisit = s.visits[0] ?? 0;
    const worstLastVisit = worst.visits[0] ?? 0;
    if (s.count < worst.count || (s.count === worst.count && sLastVisit < worstLastVisit)) {
      worstKey = k;
      worst = s;
    }
  }
  delete entry.items[worstKey];
}

export function recordSelection({
  query,
  id,
  kind,
}: {
  query: string;
  id: string;
  kind: OmnibarItemKind;
}) {
  const q = query.toLowerCase();
  if (q.length === 0) return;
  const now = Date.now();
  const entry = state.queries[q] ?? { lastTouched: now, items: {} };
  const itemKey = makeKey(kind, id);
  const sel = entry.items[itemKey] ?? { count: 0, visits: [] };
  sel.count += 1;
  sel.visits = [now, ...sel.visits].slice(0, VISITS_CAP);
  entry.items[itemKey] = sel;
  entry.lastTouched = now;
  state.queries[q] = entry;
  evictItemsIfNeeded(entry);
  evictLRUIfNeeded();
}

export function clearQueryLearning() {
  for (const k of Object.keys(state.queries)) delete state.queries[k];
}

export function useQueryLearning() {
  return useSnapshot(state).queries;
}

export type QueriesSnapshot = Readonly<Record<string, Snapshot<QueryEntry>>>;

function selectionFor(queries: QueriesSnapshot, query: string, item: OmnibarItem) {
  return queries[query]?.items[makeKey(item.kind, itemIdOf(item))];
}

function bestSubQueryScore(
  queries: QueriesSnapshot,
  query: string,
  item: OmnibarItem,
  now: number,
) {
  let best = 0;
  for (const [storedQ, entry] of Object.entries(queries)) {
    if (storedQ === query) continue;
    if (!storedQ.startsWith(query) && !query.startsWith(storedQ)) continue;
    const sel = entry.items[makeKey(item.kind, itemIdOf(item))];
    if (!sel) continue;
    const s = normalize(slackScore(sel, now));
    if (s > best) best = s;
  }
  return best;
}

function fallbackScore(frequencies: Readonly<Record<string, FrequencyEntry>>, item: OmnibarItem) {
  const freq = frequencies[makeKey(item.kind, itemIdOf(item))];
  if (!freq) return 0;
  return Math.min(1, recencyBoost(freq.lastUsed) / 0.15);
}

export function queryLearningBoost(
  rawQuery: string,
  item: OmnibarItem,
  queries: QueriesSnapshot,
  frequencies: Readonly<Record<string, FrequencyEntry>>,
) {
  const query = rawQuery.toLowerCase();
  if (query.length === 0) return 0;
  const now = Date.now();

  const exactSel = selectionFor(queries, query, item);
  const exact = exactSel ? normalize(slackScore(exactSel, now)) : 0;
  const subQuery = bestSubQueryScore(queries, query, item, now);
  const fallback = fallbackScore(frequencies, item);

  const blended = Math.max(1.0 * exact, 0.7 * subQuery, 0.5 * fallback);
  return 0.25 * blended;
}
