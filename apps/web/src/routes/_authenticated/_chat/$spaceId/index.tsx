import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDescendants } from "@/spaces/api";
import { getLastRoom } from "@/lib/last-room";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId/")({
  loader: async ({ params }) => {
    const result = await getDescendants(params.spaceId);
    if (!result.ok) return;
    const roomIds = result.value;
    if (roomIds.length === 0) return;

    const lastRoomId = getLastRoom(params.spaceId);
    const target = lastRoomId && roomIds.includes(lastRoomId) ? lastRoomId : roomIds[0];

    throw redirect({
      to: "/$spaceId/$roomId",
      params: { spaceId: params.spaceId, roomId: target },
    });
  },
  component: EmptySpace,
});

function EmptySpace() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-surface-500">No channels yet — create one to get started.</p>
    </div>
  );
}
