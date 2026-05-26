import type { RoomDataWithSpace } from "@harmony/core";
import { getAllRooms } from "@/rooms/api";
import { queryClient } from "@/lib/query-client";

export const ROOMS_QUERY_KEY = ["omnibar", "rooms"] as const;
export const ROOMS_STALE_TIME_MS = 30_000;

export function fetchAllRooms(): Promise<RoomDataWithSpace[]> {
  return queryClient.ensureQueryData({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: async () => {
      const result = await getAllRooms();
      if (!result.ok) throw new Error(result.error.message ?? result.error.code);
      return result.value;
    },
    staleTime: ROOMS_STALE_TIME_MS,
  });
}
