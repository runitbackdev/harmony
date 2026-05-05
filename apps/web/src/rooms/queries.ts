import { getAllRooms } from "@harmony/react";
import { queryClient } from "@/lib/query-client";

export const ROOMS_QUERY_KEY = ["omnibar", "rooms"] as const;
export const ROOMS_STALE_TIME_MS = 30_000;

/** Fetches the room list, sharing a 30s cache with the omnibar's `useQuery`.
 *  Lets non-hook callers (command handlers, navigation utilities) avoid
 *  spamming the worker with redundant `getAllRooms` round-trips. */
export function fetchAllRooms() {
  return queryClient.ensureQueryData({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: getAllRooms,
    staleTime: ROOMS_STALE_TIME_MS,
  });
}
