import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Dialog, Sidebar } from "@harmony/ui";
import { createRoom, subscribeRooms, useRooms } from "@harmony/react";
import { Hash, Plus, X } from "lucide-react";
import * as v from "valibot";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId")({
  loader: async ({ params }) => {
    await subscribeRooms(params.spaceId);
  },
  pendingComponent: PendingSkeleton,
  component: RouteComponent,
});

const createRoomSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
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
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: createRoomSchema },
    onSubmit: async ({ value }) => {
      await createRoom(spaceId!, value.name);
      setCreateOpen(false);
      form.reset();
    },
  });

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
        <div className="p-2">
          <button
            className="btn preset-tonal-surface w-full gap-2 text-sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} />
            Create Channel
          </button>
        </div>
      </Sidebar>

      <Dialog open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Title>Create a Channel</Dialog.Title>
            <Dialog.Description>
              Give your channel a name to get started.
            </Dialog.Description>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="mt-4 space-y-4"
            >
              <form.Field name="name">
                {(field) => (
                  <label className="label">
                    <span className="label-text text-sm">Name</span>
                    <input
                      className="input"
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      autoFocus
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-error-500 text-xs">
                        {field.state.meta.errors[0]?.message}
                      </p>
                    )}
                  </label>
                )}
              </form.Field>

              <button
                className="btn preset-filled-primary-500 w-full"
                type="submit"
                disabled={form.state.isSubmitting}
              >
                {form.state.isSubmitting ? "Creating…" : "Create"}
              </button>
            </form>

            <Dialog.CloseTrigger>
              <X size={16} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog>

      <Outlet />
    </>
  );
}
