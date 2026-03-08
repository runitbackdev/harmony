import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { Sidebar } from "@harmony/ui";
import { subscribeRooms, useRooms } from "@harmony/react";
import { Hash } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId")({
  loader: async ({ params }) => {
    await subscribeRooms(params.spaceId);
  },
  pendingComponent: PendingSkeleton,
  component: RouteComponent,
});

const SKELETON_WIDTHS = ["75%", "60%", "85%", "65%", "70%"];

function PendingSkeleton() {
  return (
    <Sidebar>
      <Sidebar.Header data-sidebar="header">
        <div className="h-5 w-32 animate-pulse rounded bg-surface-300-700" />
      </Sidebar.Header>
      <div className="flex-1 space-y-2 p-2">
        {SKELETON_WIDTHS.map((width, i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded bg-surface-300-700"
            style={{ width }}
          />
        ))}
      </div>
    </Sidebar>
  );
}

function RouteComponent() {
  const rooms = useRooms();
  const navigate = useNavigate();
  const { spaceId, roomId } = useParams({ strict: false });

  return (
    <>
      <Sidebar>
        <Sidebar.Header data-sidebar="header">Channels</Sidebar.Header>
        <div className="flex-1 overflow-y-auto">
          <Sidebar.List>
            {rooms.map((room) => (
              <Sidebar.Item
                key={room.roomId}
                icon={<Hash size={16} />}
                active={roomId === room.roomId}
                onClick={() =>
                  navigate({
                    to: "/$spaceId/$roomId",
                    params: { spaceId: spaceId!, roomId: room.roomId },
                  })
                }
              >
                {room.displayName}
              </Sidebar.Item>
            ))}
          </Sidebar.List>
        </div>
      </Sidebar>
      <Outlet />
    </>
  );
}
