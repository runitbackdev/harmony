import { useState } from "react";
import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Dialog, TextField } from "@harmony/ui";
import { AtSign, Boxes, ChevronDown, ChevronUp, X } from "lucide-react";
import { createSpace, subscribeSpaces } from "@harmony/react";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { useOmnibarCommands } from "@/omnibar";
import { jumpToRoom } from "@/rooms/navigation";
import { SpaceRail } from "@/nav/space-rail";

export const Route = createFileRoute("/_authenticated/_chat")({
  loader: async () => {
    await subscribeSpaces();
  },
  component: RouteComponent,
});

const createSpaceSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
  avatar: v.nullable(v.instance(File)),
});

function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({
    defaultValues: { name: "", avatar: null as File | null },
    validators: { onSubmit: createSpaceSchema },
    onSubmit: async ({ value }) => {
      await createSpace(value.name, value.avatar);
      onOpenChange(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Title>Create a Space</Dialog.Title>
            <Dialog.Description>Give your space a name to get started.</Dialog.Description>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="mt-4 space-y-4"
            >
              <form.Field name="name">
                {(field) => (
                  <TextField
                    label="Name"
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0]?.message}
                    autoFocus
                  />
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
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog>
  );
}

function RouteComponent() {
  const navigate = useNavigate();
  const { roomId } = useParams({ strict: false });
  const [createOpen, setCreateOpen] = useState(false);

  useOmnibarCommands(
    [
      {
        id: "comm.create-space",
        label: "Create new space…",
        icon: Boxes,
        keywords: ["new", "server", "community"],
        defaultScore: 0.6,
        perform: () => setCreateOpen(true),
      },
      {
        id: "nav.unread-next",
        label: "Jump to next unread room",
        icon: ChevronDown,
        defaultScore: 0.7,
        perform: () =>
          void jumpToRoom(navigate, roomId, (r) => r.unreadCount > 0, "next", "No unread rooms"),
      },
      {
        id: "nav.unread-prev",
        label: "Jump to previous unread room",
        icon: ChevronUp,
        perform: () =>
          void jumpToRoom(navigate, roomId, (r) => r.unreadCount > 0, "prev", "No unread rooms"),
      },
      {
        id: "nav.mention-next",
        label: "Jump to next mention",
        icon: AtSign,
        perform: () =>
          void jumpToRoom(navigate, roomId, (r) => r.mentionCount > 0, "next", "No mentions"),
      },
    ],
    [roomId],
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <SpaceRail className="hidden md:flex" />
      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Outlet />
    </div>
  );
}
