import { harmony } from "@harmony/core";
import { applyListDiff, type ListDiff, type TimelineEvent } from "@harmony/protocol";
import { createKeyedSubscription } from "./subscription";
import { seedReactions, updateReactions, clearReactions } from "./reactions";

function stripReactions(event: TimelineEvent): TimelineEvent {
  if (!event.reactions?.length) return event;
  return { ...event, reactions: null };
}

function eventBodyKey(event: TimelineEvent): string {
  const c = event.content;
  if (c.type === "message") return `${c.body}\0${c.formattedBody ?? ""}`;
  return c.type;
}

function isReactionOnly(existing: TimelineEvent, incoming: TimelineEvent): boolean {
  return (
    existing.id === incoming.id &&
    existing.sender === incoming.sender &&
    existing.timestamp === incoming.timestamp &&
    eventBodyKey(existing) === eventBodyKey(incoming)
  );
}

function processAndApply(items: TimelineEvent[], diff: ListDiff<TimelineEvent>) {
  if (diff.op === "set") {
    updateReactions(diff.value);
    const existing = items[diff.index];
    if (existing && isReactionOnly(existing, diff.value)) return;
    applyListDiff(items, { ...diff, value: stripReactions(diff.value) });
    return;
  }

  if ("value" in diff) {
    updateReactions(diff.value);
    applyListDiff(items, { ...diff, value: stripReactions(diff.value) });
    return;
  }

  if ("values" in diff) {
    for (const v of diff.values) updateReactions(v);
    applyListDiff(items, { ...diff, values: diff.values.map(stripReactions) });
    return;
  }

  applyListDiff(items, diff);
}

const timeline = createKeyedSubscription<string, TimelineEvent>((roomId, items) =>
  harmony.timeline.subscribe(roomId).then(({ events: initial }) => {
    seedReactions(initial);
    for (let i = 0; i < initial.length; i++) initial[i] = stripReactions(initial[i]);

    const unsub = harmony.on("h.timeline.update", ({ roomId: rid, events: diffs }) => {
      if (rid !== roomId) return;
      for (const diff of diffs) processAndApply(items, diff);
    });

    return {
      initial,
      cleanup: () => {
        unsub();
        clearReactions();
        harmony.timeline.unsubscribe(roomId);
      },
    };
  }),
);

export const useTimeline = timeline.useValue;
export const subscribeTimeline = timeline.start;
export const unsubscribeTimeline = timeline.stop;

export async function sendMessage(roomId: string, body: string, formattedBody?: string) {
  await harmony.timeline.send(roomId, body, formattedBody);
}

export type { EditTarget } from "@harmony/core";

export async function editMessage(
  roomId: string,
  target: { eventId?: string; transactionId?: string },
  body: string,
  formattedBody?: string,
) {
  await harmony.timeline.edit(roomId, target, body, formattedBody);
}

export async function toggleReaction(
  roomId: string,
  target: { eventId?: string; transactionId?: string },
  key: string,
) {
  const result = await harmony.timeline.toggleReaction(roomId, target, key);
  return result.added;
}

export async function paginateTimeline(roomId: string, count = 50) {
  const result = await harmony.timeline.paginate(roomId, count);
  return result.hitStart;
}
