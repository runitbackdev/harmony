import { harmony } from "@harmony/core";
import {
  applyListDiff,
  type ListDiff,
  type PaginationDirection,
  type TimelineEvent,
} from "@harmony/protocol";
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

const generationByRoom = new Map<string, number>();

function applySnapshot(roomId: string, events: TimelineEvent[], generation: number) {
  generationByRoom.set(roomId, generation);
  clearReactions();
  seedReactions(events);
  const stripped = events.map(stripReactions);
  timeline.replace(roomId, stripped);
}

const timeline = createKeyedSubscription<string, TimelineEvent>(async (roomId, items) => {
  const { events, generation } = await harmony.timeline.subscribe(roomId);
  generationByRoom.set(roomId, generation);
  seedReactions(events);
  const stripped = events.map(stripReactions);

  const unsub = harmony.on("h.timeline.update", ({ roomId: rid, message }) => {
    if (rid !== roomId) return;
    if (message.kind === "error") {
      console.error(`[timeline] stream error for ${roomId}:`, message.message);
      return;
    }
    const expected = generationByRoom.get(roomId);
    if (expected !== undefined && message.generation !== expected) return;
    for (const diff of message.diffs) processAndApply(items, diff);
  });

  return {
    initial: stripped,
    cleanup: () => {
      unsub();
      clearReactions();
      generationByRoom.delete(roomId);
      harmony.timeline.unsubscribe(roomId);
    },
  };
});

export const useTimeline = timeline.useValue;
export const subscribeTimeline = timeline.start;
export const unsubscribeTimeline = timeline.stop;

export async function sendMessage(
  roomId: string,
  body: string,
  formattedBody?: string,
  replyToEventId?: string,
) {
  await harmony.timeline.send(roomId, body, formattedBody, replyToEventId);
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

export async function redactMessage(
  roomId: string,
  target: { eventId?: string; transactionId?: string },
) {
  await harmony.timeline.redact(roomId, target);
}

export async function paginateTimeline(
  roomId: string,
  direction: PaginationDirection = "backward",
  count = 50,
) {
  const result = await harmony.timeline.paginate(roomId, direction, count);
  if (result.events && result.generation !== undefined) {
    applySnapshot(roomId, result.events, result.generation);
  }
  return result;
}

export async function focusOnEvent(
  roomId: string,
  targetEventId: string,
  numContextEvents?: number,
) {
  const result = await harmony.timeline.focusOnEvent(roomId, targetEventId, numContextEvents);
  applySnapshot(roomId, result.events, result.generation);
  return result;
}

export async function returnToLive(roomId: string) {
  const result = await harmony.timeline.returnToLive(roomId);
  applySnapshot(roomId, result.events, result.generation);
  return result;
}

export async function markAsRead(roomId: string) {
  await harmony.timeline.markAsRead(roomId);
}
