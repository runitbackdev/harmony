import { useCallback, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button, Dialog, Input } from "@runitbk/react";
import { Sidebar, TextField } from "@/ui";
import { createRoom } from "@/spaces/api";
import { useRoomsInSpace } from "@/rooms/api";
import { useSpaces } from "@/spaces/api";
import { createInviteErrorMessage, useCreateInvite } from "@/invites/api";
import { Check, Copy, Hash, Link, Plus, X } from "lucide-react";
import * as v from "valibot";

// #region Schemas

const createRoomSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
});

// #endregion

// #region RoomList

function RoomList({ spaceId, onPick }: { spaceId: string; onPick?: () => void }) {
  const roomsSub = useRoomsInSpace(spaceId);
  const rooms = roomsSub.value ?? [];
  const navigate = useNavigate();
  const { roomId } = useParams({ strict: false });

  const handleClick = useCallback(
    (targetRoomId: string) => {
      void navigate({
        to: "/$spaceId/$roomId",
        params: { spaceId, roomId: targetRoomId },
      });
      onPick?.();
    },
    [navigate, spaceId, onPick],
  );

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-small text-sub">No channels yet.</p>
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

// #endregion

// #region InviteDialog

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

  function handleClose(open: boolean) {
    onOpenChange(open);
    if (!open) setCopied(false);
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Invite People</Dialog.Title>
          <Dialog.Description>Share this link to invite others to your space.</Dialog.Description>

          <div className="mt-4">
            {createInvite.isPending ? (
              <div className="h-10 animate-pulse rounded bg-soft" />
            ) : createInvite.isError ? (
              <p className="text-danger text-small">
                {createInviteErrorMessage(createInvite.error)}
              </p>
            ) : inviteUrl ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  aria-label="Invite link"
                  className="flex-1 truncate"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button className="shrink-0" onClick={() => void handleCopy()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : null}
          </div>

          <Dialog.Close className="absolute top-4 right-4 cursor-pointer text-sub transition-colors hover:text-ink">
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// #endregion

interface RoomSidebarProps {
  spaceId: string;
  className?: string;
  onAfterNavigate?: () => void;
}

/**
 * Shared component for the channel sidebar.
 * Does NOT register omnibar commands (those should be hoisted to the route).
 */
export function RoomSidebar({ spaceId, className, onAfterNavigate }: RoomSidebarProps) {
  const spacesSub = useSpaces();
  const currentSpace = (spacesSub.value ?? []).find((s) => s.roomId === spaceId);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const createInvite = useCreateInvite();

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: createRoomSchema },
    onSubmit: async ({ value }) => {
      const result = await createRoom({ spaceId, name: value.name, visibility: "public" });
      if (!result.ok) throw new Error(result.error.message ?? result.error.code);
      setCreateOpen(false);
      form.reset();
    },
  });

  return (
    <>
      <Sidebar className={className}>
        <Sidebar.Header data-sidebar="header">
          {currentSpace?.displayName ?? "Channels"}
        </Sidebar.Header>
        <div className="flex-1 overflow-y-auto">
          <RoomList spaceId={spaceId} onPick={onAfterNavigate} />
        </div>
        <div className="space-y-1 p-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setInviteOpen(true);
              if (!createInvite.data) createInvite.mutate({ spaceMxid: spaceId });
            }}
            aria-label="Invite people"
          >
            <Link size={16} />
            Invite People
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setCreateOpen(true)}
            aria-label="Create channel"
          >
            <Plus size={16} />
            Create Channel
          </Button>
        </div>
      </Sidebar>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
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

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} createInvite={createInvite} />
    </>
  );
}
