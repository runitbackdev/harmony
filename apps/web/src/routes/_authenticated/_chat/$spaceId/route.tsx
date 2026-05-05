import { useCallback, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Dialog, Sidebar, TextField } from "@harmony/ui";
import { createRoom, subscribeRooms, useCreateInvite, useRooms, useSpaces } from "@harmony/react";
import { Check, Copy, Hash, Link, Plus, UserPlus, X } from "lucide-react";
import * as v from "valibot";
import { useOmnibarCommands } from "@/omnibar";
import { useSpaceCommands } from "@/spaces/commands";

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
          <div key={i} className="h-8 animate-pulse rounded bg-surface-300-700" style={{ width }} />
        ))}
      </div>
    </Sidebar>
  );
}

function RoomList() {
  const rooms = useRooms();
  const navigate = useNavigate();
  const { spaceId, roomId } = useParams({ strict: false });

  const handleClick = useCallback(
    (targetRoomId: string) => {
      void navigate({
        to: "/$spaceId/$roomId",
        params: { spaceId: spaceId!, roomId: targetRoomId },
      });
    },
    [navigate, spaceId],
  );

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm text-surface-500">No channels yet.</p>
      </div>
    );
  }

  return (
    <Sidebar.List>
      {rooms.map((room) => {
        const hasMention = room.mentionCount > 0;
        const hasUnread = room.unreadCount > 0;

        return (
          <Sidebar.Item
            key={room.roomId}
            icon={<Hash size={16} />}
            active={roomId === room.roomId}
            unread={hasUnread}
            badge={hasMention || hasUnread ? <Sidebar.Dot mention={hasMention} /> : undefined}
            onClick={() => handleClick(room.roomId)}
          >
            {room.displayName}
          </Sidebar.Item>
        );
      })}
    </Sidebar.List>
  );
}

function RouteComponent() {
  const { spaceId } = useParams({ strict: false });
  const spaces = useSpaces();
  const currentSpace = spaces.find((s) => s.roomId === spaceId);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const createInvite = useCreateInvite();

  useSpaceCommands(spaceId!);

  useOmnibarCommands(
    [
      {
        id: "space.create-channel",
        label: "Create channel in this space",
        icon: Plus,
        keywords: ["new", "room"],
        perform: () => setCreateOpen(true),
      },
      {
        id: "space.invite",
        label: "Invite people to this space",
        icon: UserPlus,
        keywords: ["share", "members"],
        perform: () => {
          setInviteOpen(true);
          if (!createInvite.data) createInvite.mutate({ spaceMxid: spaceId! });
        },
      },
    ],
    [spaceId, createInvite.data],
  );

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: createRoomSchema },
    onSubmit: async ({ value }) => {
      await createRoom(spaceId!, value.name, "public");
      setCreateOpen(false);
      form.reset();
    },
  });

  return (
    <>
      <Sidebar>
        <Sidebar.Header data-sidebar="header">
          {currentSpace?.displayName ?? "Channels"}
        </Sidebar.Header>
        <div className="flex-1 overflow-y-auto">
          <RoomList />
        </div>
        <div className="space-y-1 p-2">
          <button
            className="btn preset-tonal-surface w-full gap-2 text-sm"
            onClick={() => {
              setInviteOpen(true);
              if (!createInvite.data) createInvite.mutate({ spaceMxid: spaceId! });
            }}
            aria-label="Create invite link"
          >
            <Link size={16} />
            Invite People
          </button>
          <button
            className="btn preset-tonal-surface w-full gap-2 text-sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create channel"
          >
            <Plus size={16} />
            Create Channel
          </button>
        </div>
      </Sidebar>

      <Dialog open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Title>Create a Channel</Dialog.Title>
              <Dialog.Description>Give your channel a name to get started.</Dialog.Description>

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
                <X size={16} />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} createInvite={createInvite} />

      <Outlet />
    </>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  createInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createInvite: ReturnType<typeof useCreateInvite>;
}) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = createInvite.data
    ? `${window.location.origin}/invite/${createInvite.data.code}`
    : null;

  function handleClose(event: { open: boolean }) {
    onOpenChange(event.open);
    if (!event.open) setCopied(false);
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Title>Invite People</Dialog.Title>
            <Dialog.Description>Share this link to invite others to your space.</Dialog.Description>

            <div className="mt-4">
              {createInvite.isPending ? (
                <div className="h-10 animate-pulse rounded bg-surface-200-800" />
              ) : createInvite.isError ? (
                <p className="text-error-500 text-sm">Failed to create invite link.</p>
              ) : inviteUrl ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    aria-label="Invite link"
                    className="input flex-1 truncate bg-surface-200-800 px-3 py-2 text-sm"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button
                    className="btn preset-filled-primary-500 shrink-0 gap-1.5"
                    onClick={() => void handleCopy()}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : null}
            </div>

            <Dialog.CloseTrigger>
              <X size={16} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog>
  );
}
