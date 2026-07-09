import type { TimelineEventData as TimelineEvent } from "@harmony/harmony-bindings-web";

export function eventKey(event: TimelineEvent, index: number) {
  return event.id ?? `pending-${index}`;
}

export function newMessageCount(events: TimelineEvent[], lastSeenKey: string | null) {
  if (lastSeenKey === null) return 0;

  const seenIndex = events.findIndex((event, index) => eventKey(event, index) === lastSeenKey);
  if (seenIndex === -1) return 0;

  let count = 0;
  for (let index = seenIndex + 1; index < events.length; index++) {
    if (events[index].content.type === "message") count++;
  }
  return count;
}

export function lastEventKey(events: TimelineEvent[]) {
  if (events.length === 0) return null;
  const lastIndex = events.length - 1;
  return eventKey(events[lastIndex], lastIndex);
}
