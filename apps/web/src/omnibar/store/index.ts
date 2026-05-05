import type { OmnibarItemKind } from "../types";
import { recordRecent } from "./recents";
import { recordFrequency } from "./frequencies";
import { recordSelection } from "./query-learning";

export function recordUsage(entry: { id: string; kind: OmnibarItemKind; query?: string }) {
  recordRecent({ id: entry.id, kind: entry.kind });
  recordFrequency({ id: entry.id, kind: entry.kind });
  if (entry.query !== undefined && entry.query.length > 0) {
    recordSelection({ query: entry.query, id: entry.id, kind: entry.kind });
  }
}

export { clearRecents, hydrateRecent, useRecents, type RecentEntry } from "./recents";
export {
  clearFrequencies,
  frequencyBoost,
  getFrequencyEntry,
  recencyBoost,
  useFrequencies,
  type FrequencyEntry,
} from "./frequencies";
export {
  clearQueryLearning,
  queryLearningBoost,
  recordSelection,
  useQueryLearning,
  type QueriesSnapshot,
  type QueryEntry,
  type Selection,
} from "./query-learning";
