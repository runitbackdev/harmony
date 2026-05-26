import { applyListDiff } from "@harmony/core/protocol";
import { rpc } from "@harmony/core";
import { useListSubscription } from "@harmony/react";
import type { CreateRoomInput, CreateSpaceInput, SpaceData } from "@harmony/core";

export const getSpaces = () => rpc("spaces.get", undefined);
export const getDescendants = (spaceId: string) => rpc("spaces.descendants", spaceId);
export const createSpace = (input: CreateSpaceInput) => rpc("spaces.create", input);
export const createRoom = (input: CreateRoomInput) => rpc("spaces.create_room", input);

const EMPTY: SpaceData[] = [];

export function useSpaces() {
  return useListSubscription("spaces.subscribe", undefined, (state, diff) => {
    const next = [...(state ?? EMPTY)];
    applyListDiff(next, diff);
    return next;
  });
}
