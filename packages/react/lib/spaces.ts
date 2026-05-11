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
export const subscribeSpaces = spaces.start;

export function getFirstSpace() {
  return spaces.state.items[0] ?? null;
}

export async function createSpace(name: string, avatar?: File | null) {
  const avatarPayload = avatar
    ? { bytes: new Uint8Array(await avatar.arrayBuffer()), contentType: avatar.type }
    : null;

  const { space } = await harmony.spaces.create(name, avatarPayload);

  return space;
}

export async function joinSpace(spaceId: string) {
  const { space } = await harmony.spaces.join(spaceId);

  return space;
}
