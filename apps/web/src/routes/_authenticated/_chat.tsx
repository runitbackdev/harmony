import { useState } from "react";
import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Button, Dialog } from "@runitbk/react";
import { TextField } from "@/ui";
import { AtSign, Boxes, ChevronDown, ChevronUp, X } from "lucide-react";
import { createSpace } from "@/spaces/api";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { useOmnibarCommands } from "@/omnibar";
import { jumpToRoom } from "@/rooms/navigation";
import { SpaceRail } from "@/nav/space-rail";

export const Route = createFileRoute("/_authenticated/_chat")({
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

async function fileToBytes(file: File): Promise<number[]> {
  const buf = await file.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

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
      const avatarBytes = value.avatar ? await fileToBytes(value.avatar) : null;
      const avatarContentType = value.avatar?.type ?? null;
      const result = await createSpace({
        name: value.name,
        avatarBytes,
        avatarContentType,
      });
      if (!result.ok) throw new Error(result.error.message ?? result.error.code);
      onOpenChange(false);
      form.reset();
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
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

            <Button type="submit" disabled={form.state.isSubmitting} className="w-full">
              {form.state.isSubmitting ? "Creating…" : "Create"}
            </Button>
          </form>

          <Dialog.Close className="absolute top-4 right-4 cursor-pointer text-sub transition-colors hover:text-ink">
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
