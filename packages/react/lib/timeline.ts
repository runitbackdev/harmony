import { harmony } from "@harmony/core";
import { applyListDiff, type TimelineEvent } from "@harmony/protocol";
import { createKeyedSubscription } from "./subscription";

const timeline = createKeyedSubscription<string, TimelineEvent>(
  (roomId, items) =>
    harmony.timeline.subscribe(roomId).then(({ events: initial }) => {
      const unsub = harmony.on(
        "h.timeline.update",
        ({ roomId: rid, events: diffs }) => {
          if (rid !== roomId) return;
          for (const diff of diffs) applyListDiff(items, diff);
        },
      );

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
