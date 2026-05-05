import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Dialog, MxAvatar, Rail, TextField } from "@harmony/ui";
import { AtSign, Boxes, ChevronDown, ChevronUp, Home, ImagePlus, Plus, X } from "lucide-react";
import { createSpace, subscribeSpaces, useSpaces } from "@harmony/react";
import * as v from "valibot";
import { useOmnibarCommands } from "@/omnibar";
import { jumpToRoom } from "@/rooms/navigation";

export const Route = createFileRoute("/_authenticated/_chat")({
  loader: async () => {
    await subscribeSpaces();
  },
  component: RouteComponent,
});

function AvatarPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-surface-300-700 transition-opacity hover:opacity-80"
        aria-label="Choose space avatar"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus size={24} className="text-surface-500" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-surface-500 transition-colors hover:text-surface-950-50"
        >
          Remove
        </button>
      )}
    </div>
  );
}

const createSpaceSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
  avatar: v.nullable(v.instance(File)),
});

function RouteComponent() {
  const spaces = useSpaces();
  const navigate = useNavigate();
  const { spaceId, roomId } = useParams({ strict: false });
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

  const form = useForm({
    defaultValues: { name: "", avatar: null as File | null },
    validators: { onSubmit: createSpaceSchema },
    onSubmit: async ({ value }) => {
      await createSpace(value.name, value.avatar);
      setCreateOpen(false);
      form.reset();
    },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Rail>
        <Rail.Item label="Home" data-rail="home">
          <Home size={20} />
        </Rail.Item>

        <Rail.Separator />

        {spaces.length > 0 && (
          <>
            {spaces.map((space) => (
              <Rail.Item
                key={space.roomId}
                active={spaceId === space.roomId}
                label={space.displayName}
                data-rail="server"
                data-server={space.roomId}
                onClick={() =>
                  navigate({
                    to: "/$spaceId",
                    params: { spaceId: space.roomId },
                  })
                }
              >
                <MxAvatar
                  mxc={space.avatarUrl}
                  name={space.displayName}
                  size={96}
                  className="size-full rounded-[inherit]! text-xs font-semibold"
                />
              </Rail.Item>
            ))}

            <Rail.Separator />
          </>
        )}

        <Rail.Item label="Create space" data-rail="add-server" onClick={() => setCreateOpen(true)}>
          <Plus size={20} />
        </Rail.Item>
      </Rail>

      <Dialog open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
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
                <form.Field name="avatar">
                  {(field) => (
                    <AvatarPicker file={field.state.value} onChange={field.handleChange} />
                  )}
                </form.Field>

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

      <Outlet />
    </div>
  );
}
