import { harmony } from "@harmony/core";
import { applyListDiff, type SpaceSummary } from "@harmony/protocol";
import { createSubscription } from "./subscription";

export const spaces = createSubscription<SpaceSummary>((items) =>
  harmony.spaces.subscribe().then(({ spaces: initial }) => {
    const unsub = harmony.on("h.spaces.update", ({ spaces: diffs }) => {
      for (const diff of diffs) applyListDiff(items, diff);
    });

    return {
      initial,
      cleanup: () => {
        unsub();
        harmony.spaces.unsubscribe();
      },
    };
  }),
);

export const useSpaces = spaces.useValue;

export async function createSpace(name: string) {
  const { space } = await harmony.spaces.create(name);

  return space;
}
