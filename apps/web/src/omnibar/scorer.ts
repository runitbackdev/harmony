import { useMemo } from "react";
import { Fzf, byLengthAsc, type FzfResultItem } from "fzf";
import type { RoomDataWithSpace } from "@harmony/core";
import type { Command, OmnibarItem } from "./types";

const FZF_SCORE_MATCH = 16;
const FZF_BONUS_BOUNDARY_WHITE = 10;
const FZF_BONUS_FIRST_CHAR_MULTIPLIER = 2;

export const SCORER_LIMIT = 50;

export type Scorer = (query: string) => FzfResultItem<OmnibarItem>[];

export type Scorers = {
  all: Scorer;
  command: Scorer;
  room: Scorer;
};

export function normalizeFzfScore(rawScore: number, queryLen: number): number {
  if (queryLen === 0) return 0;
  const max =
    (FZF_SCORE_MATCH + FZF_BONUS_BOUNDARY_WHITE) * queryLen +
    FZF_SCORE_MATCH * (FZF_BONUS_FIRST_CHAR_MULTIPLIER - 1);
  return rawScore / max;
}

function selectorFor(item: OmnibarItem): string {
  switch (item.kind) {
    case "command":
      return item.command.keywords?.length
        ? `${item.command.label} ${item.command.keywords.join(" ")}`
        : item.command.label;
    case "room":
      return item.room.displayName;
  }
}

function buildScorer(items: readonly OmnibarItem[]): Scorer {
  const fzf = new Fzf(items, {
    selector: selectorFor,
    tiebreakers: [byLengthAsc],
    limit: SCORER_LIMIT,
    casing: "case-insensitive",
  });
  return (query) => fzf.find(query);
}

/** Builds per-kind scorers from current commands and rooms. Each scorer
 *  indexes only its own kind so the per-kind {@link SCORER_LIMIT} cap can't
 *  be stolen by the other kind under mode-prefixed search.
 *
 *  When `enabled` is false the scorers index nothing — Fzf init is trivial
 *  and command churn from background route changes doesn't pay reindex cost
 *  while the omnibar is closed. */
export function useScorers(
  commands: readonly Command[],
  rooms: readonly RoomDataWithSpace[],
  enabled: boolean,
): Scorers {
  const commandItems = useMemo<OmnibarItem[]>(
    () => (enabled ? commands.map((command) => ({ kind: "command", command })) : []),
    [commands, enabled],
  );
  const roomItems = useMemo<OmnibarItem[]>(
    () => (enabled ? rooms.map((room) => ({ kind: "room", room })) : []),
    [rooms, enabled],
  );
  const allItems = useMemo<OmnibarItem[]>(
    () => [...commandItems, ...roomItems],
    [commandItems, roomItems],
  );

  const command = useMemo(() => buildScorer(commandItems), [commandItems]);
  const room = useMemo(() => buildScorer(roomItems), [roomItems]);
  const all = useMemo(() => buildScorer(allItems), [allItems]);

  return useMemo(() => ({ all, command, room }), [all, command, room]);
}
