import type { FzfResultItem } from "fzf";
import type { RoomDataWithSpace } from "@harmony/core";
import { normalizeFzfScore, type Scorer, type Scorers } from "./scorer";
import {
  frequencyBoost,
  getFrequencyEntry,
  hydrateRecent,
  queryLearningBoost,
  recencyBoost,
  type FrequencyEntry,
  type QueriesSnapshot,
  type RecentEntry,
} from "./store";
import type { Command, OmnibarItem, OmnibarItemKind } from "./types";

export const EMPTY_SUGGESTION_COUNT = 5;
export const DISPLAY_LIMIT = 25;
const MIN_SCORE = 0.2;
const MIN_FUZZY_QUERY_LEN = 2;

const TYPE_WEIGHT: Record<OmnibarItemKind, number> = {
  command: 0.85,
  room: 1.0,
};

const SAME_SPACE_BOOST = 0.15;

function sameSpaceBoost(item: OmnibarItem, currentSpaceId: string | undefined) {
  if (!currentSpaceId || item.kind !== "room") return 0;
  return item.room.parentSpace?.roomId === currentSpaceId ? SAME_SPACE_BOOST : 0;
}

export function parseMode(input: string) {
  if (input.startsWith(">")) return { mode: "command" as const, query: input.slice(1) };
  if (input.startsWith("#")) return { mode: "room" as const, query: input.slice(1) };
  return { mode: null, query: input };
}

function isOmnibarItem(x: OmnibarItem | null): x is OmnibarItem {
  return x !== null;
}

function byMode(mode: OmnibarItemKind | null) {
  return function modeFilter(item: OmnibarItem) {
    return mode === null || item.kind === mode;
  };
}

function hydratorFor(commands: readonly Command[], rooms: readonly RoomDataWithSpace[]) {
  return function hydrate(entry: RecentEntry) {
    return hydrateRecent(entry, commands, rooms);
  };
}

function wrapRoom(room: RoomDataWithSpace) {
  return { kind: "room" as const, room };
}

function wrapCommand(command: Command) {
  return { kind: "command" as const, command };
}

function byDefaultScoreDesc(a: Command, b: Command) {
  return (b.defaultScore ?? 0) - (a.defaultScore ?? 0);
}

function hasDefaultScore(c: Command) {
  return (c.defaultScore ?? 0) > 0;
}

function rankWith(
  query: string,
  frequencies: Readonly<Record<string, FrequencyEntry>>,
  queries: QueriesSnapshot,
  currentSpaceId: string | undefined,
) {
  return function rank(r: FzfResultItem<OmnibarItem>) {
    const base = normalizeFzfScore(r.score, query.length) * TYPE_WEIGHT[r.item.kind];
    const freq = getFrequencyEntry(frequencies, r.item);
    const itemBoost = freq ? recencyBoost(freq.lastUsed) + frequencyBoost(freq.count) : 0;
    const qlBoost = queryLearningBoost(query, r.item, queries, frequencies);
    const spaceBoost = sameSpaceBoost(r.item, currentSpaceId);
    return { item: r.item, finalScore: base + itemBoost + qlBoost + spaceBoost };
  };
}

function byFinalScoreDesc(a: { finalScore: number }, b: { finalScore: number }) {
  return b.finalScore - a.finalScore;
}

function byMinScore(scored: { finalScore: number }) {
  return scored.finalScore >= MIN_SCORE;
}

function extractItem<T>(r: { item: T }) {
  return r.item;
}

function pickScorer(scorers: Scorers, mode: OmnibarItemKind | null): Scorer {
  if (mode === "command") return scorers.command;
  if (mode === "room") return scorers.room;
  return scorers.all;
}

type PipelineInput = {
  mode: OmnibarItemKind | null;
  query: string;
  allCommands: readonly Command[];
  rooms: readonly RoomDataWithSpace[];
  recents: readonly RecentEntry[];
  frequencies: Readonly<Record<string, FrequencyEntry>>;
  queries: QueriesSnapshot;
  scorers: Scorers;
  currentSpaceId: string | undefined;
};

export function runPipeline(input: PipelineInput) {
  const { mode, query } = input;

  const recentItems = input.recents
    .map(hydratorFor(input.allCommands, input.rooms))
    .filter(isOmnibarItem)
    .filter(byMode(mode))
    .slice(0, EMPTY_SUGGESTION_COUNT);

  if (query.length < MIN_FUZZY_QUERY_LEN) {
    if (recentItems.length > 0) {
      return { filtered: recentItems, isShowingRecents: true, mode };
    }
    if (mode === "room") {
      const fallback = input.rooms.slice(0, EMPTY_SUGGESTION_COUNT).map(wrapRoom);
      return { filtered: fallback, isShowingRecents: false, mode };
    }
    const fallback = input.allCommands
      .filter(hasDefaultScore)
      .sort(byDefaultScoreDesc)
      .slice(0, EMPTY_SUGGESTION_COUNT)
      .map(wrapCommand);
    return { filtered: fallback, isShowingRecents: false, mode };
  }

  const scorer = pickScorer(input.scorers, mode);
  const filtered = scorer(query)
    .map(rankWith(query, input.frequencies, input.queries, input.currentSpaceId))
    .filter(byMinScore)
    .sort(byFinalScoreDesc)
    .slice(0, DISPLAY_LIMIT)
    .map(extractItem);

  return { filtered, isShowingRecents: false, mode };
}
