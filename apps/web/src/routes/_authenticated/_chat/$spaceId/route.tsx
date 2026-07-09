import { createContext, useState } from "react";
import { createFileRoute, Outlet, redirect, useParams } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button, Dialog, Input } from "@runitback/react";
import { Drawer, Sidebar, TextField } from "@/ui";
import { createRoom, getDescendants } from "@/spaces/api";
import { createInviteErrorMessage, useCreateInvite } from "@/invites/api";
import { Check, Copy, Menu, Plus, UserPlus, X } from "lucide-react";
import * as v from "valibot";
import { useOmnibarCommands } from "@/omnibar";
import { useSpaceCommands } from "@/spaces/commands";
import { getLastRoom } from "@/lib/last-room";
import { RoomSidebar } from "@/nav/room-sidebar";
import { NavPanel } from "@/nav/nav-panel";

export const NavContext = createContext<{ setNavOpen: (open: boolean) => void } | null>(null);

export const Route = createFileRoute("/_authenticated/_chat/$spaceId")({
  beforeLoad: async ({ params, location }) => {
    if (location.pathname === `/${params.spaceId}` || location.pathname === `/${params.spaceId}/`) {
      const result = await getDescendants(params.spaceId);
      if (!result.ok) return;
      const roomIds = result.value;
      if (roomIds.length > 0) {
        const lastRoomId = getLastRoom(params.spaceId);
        const target = lastRoomId && roomIds.includes(lastRoomId) ? lastRoomId : roomIds[0];
        throw redirect({
          to: "/$spaceId/$roomId",
          params: { spaceId: params.spaceId, roomId: target },
        });
      }
    }
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
    <Sidebar className="hidden md:flex">
      <Sidebar.Header data-sidebar="header">
        <div className="h-5 w-32 animate-pulse rounded bg-soft" />
      </Sidebar.Header>
      <div className="flex-1 space-y-2 p-2">
        {SKELETON_WIDTHS.map((width, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-soft" style={{ width }} />
        ))}
      </div>
    </Sidebar>
  );
}

function RouteComponent() {
  const { spaceId, roomId } = useParams({ strict: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
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

  return (
    <NavContext.Provider value={{ setNavOpen }}>
      <RoomSidebar spaceId={spaceId!} className="hidden md:flex" />

      <CreateRoomDialog spaceId={spaceId!} open={createOpen} onOpenChange={setCreateOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} createInvite={createInvite} />

      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        {!roomId ? (
          <div className="flex flex-1 flex-col">
            <header className="flex items-center gap-2 border-b border-line px-4 py-2 md:hidden">
              <button
                type="button"
                className="text-sub transition-colors hover:text-ink mr-2"
                onClick={() => setNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-small font-semibold text-ink">Channels</h2>
            </header>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-small text-sub">No channels yet — create one to get started.</p>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </div>

      <Drawer open={navOpen} onOpenChange={setNavOpen} direction="left">
        <Drawer.Portal>
          <Drawer.Overlay />
          <Drawer.Content className="left-0 rounded-r-xl flex-row">
            <NavPanel onAfterNavigate={() => setNavOpen(false)} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer>
    </NavContext.Provider>
  );
}

function CreateRoomDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: createRoomSchema },
    onSubmit: async ({ value }) => {
      const result = await createRoom({ spaceId, name: value.name, visibility: "public" });
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
