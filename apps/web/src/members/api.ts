import { applyListDiff } from "@harmony/core/protocol";
import { rpc } from "@harmony/core";
import { useListSubscription } from "@harmony/react";
import type { MemberData } from "@harmony/core";

export const getMembers = (roomId: string) => rpc("members.get", roomId);

const EMPTY: MemberData[] = [];

export function useMembers(roomId: string) {
  return useListSubscription("members.subscribe", roomId, (state, diff) => {
    const next = [...(state ?? EMPTY)];
    applyListDiff(next, diff);
    return next;
  });
}
