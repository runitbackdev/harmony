import type { ReactionGroup, TimelineEvent } from "@harmony/protocol";
import { createKeyedMap } from "./subscription";

const reactions = createKeyedMap<ReactionGroup[]>();

export function seedReactions(events: TimelineEvent[]) {
  for (const event of events) {
    const id = event.id ?? event.transactionId;
    if (id && event.reactions?.length) {
      reactions.set(id, event.reactions);
    }
  }
}

export function updateReactions(event: TimelineEvent) {
  const id = event.id ?? event.transactionId;
  if (!id) return;
  if (event.reactions?.length) {
    reactions.set(id, event.reactions);
  } else {
    reactions.remove(id);
  }
}

export const clearReactions = reactions.clear;
export const useReactions = reactions.useEntry;
