import { harmony } from "@harmony/core";
import { applyListDiff, type TimelineEvent } from "@harmony/protocol";
import { createKeyedSubscription } from "./subscription";

const timeline = createKeyedSubscription<string, TimelineEvent>((roomId, items) =>
  harmony.timeline.subscribe(roomId).then(({ events: initial }) => {
    const unsub = harmony.on("h.timeline.update", ({ roomId: rid, events: diffs }) => {
      if (rid !== roomId) return;
      for (const diff of diffs) applyListDiff(items, diff);
    });

    return {
      initial,
      cleanup: () => {
        unsub();
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

export async function paginateTimeline(roomId: string, count = 50) {
  const result = await harmony.timeline.paginate(roomId, count);
  return result.hitStart;
}
