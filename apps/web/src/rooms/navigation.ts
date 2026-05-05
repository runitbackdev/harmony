import type { useNavigate } from "@tanstack/react-router";
import type { RoomWithSpaceSummary } from "@harmony/protocol";
import { toast } from "@/lib/toast";
import { fetchAllRooms } from "./queries";

type Navigate = ReturnType<typeof useNavigate>;

/** Jumps to the next/previous room satisfying `predicate`, relative to the
 *  current room. Wraps around the matching set; toasts when nothing matches. */
export async function jumpToRoom(
  navigate: Navigate,
  currentRoomId: string | undefined,
  predicate: (room: RoomWithSpaceSummary) => boolean,
  direction: "next" | "prev",
  emptyMessage: string,
): Promise<void> {
  const rooms = await fetchAllRooms();
  const matching = rooms.filter(predicate);
  if (matching.length === 0) {
    toast.info(emptyMessage);
    return;
  }
  const currentIdx = currentRoomId ? matching.findIndex((r) => r.roomId === currentRoomId) : -1;
  const nextIdx =
    currentIdx === -1
      ? 0
      : direction === "next"
        ? (currentIdx + 1) % matching.length
        : (currentIdx - 1 + matching.length) % matching.length;
  const target = matching[nextIdx];
  if (!target.parentSpace) return;
  void navigate({
    to: "/$spaceId/$roomId",
    params: { spaceId: target.parentSpace.roomId, roomId: target.roomId },
  });
}
