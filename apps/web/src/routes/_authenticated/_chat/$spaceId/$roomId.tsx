import { forwardRef, useCallback, useEffect, useRef, useState, useContext } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import {
  editMessage,
  focusOnEvent,
  markRoomAsRead,
  paginateTimeline,
  redactMessage,
  sendMessage,
  toggleReaction,
  useTimeline,
} from "@/timeline/api";
import { getMembers, useMembers } from "@/members/api";
import { useRoomsInSpace } from "@/rooms/api";
import { useSession } from "@/auth/api";
import { mediaUpload } from "@harmony/react";
import { Drawer, MemberList, MessageList, type MessageListHandle } from "@/ui";
import { Transition, useMediaQuery } from "@/primitives";
import { Composer, EditComposer } from "@/composer";
import type { ComposerHandle, EditTarget } from "@/composer";
import { Bug, Hash, Menu, PanelRight, Users } from "lucide-react";
import type { ReplyTarget, TimelineContent, TimelineEventData } from "@harmony/core";
import { setLastRoom } from "@/lib/last-room";
import { useOmnibarCommands } from "@/omnibar";
import { recordUsage } from "@/omnibar/store";
import { useRoomCommands } from "@/rooms/commands";
import { NavContext } from "./route";
import { buildAttachment } from "./-attachments";
import { useDropZone } from "@/ui/hooks/use-drop-zone";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId/$roomId")({
  component: TimelineView,
});

// #region Debug

function formatContent(content: TimelineContent): string {
  switch (content.type) {
    case "message":
      return `message - ${content.body}${content.formattedBody ? `\n  [html] ${content.formattedBody}` : ""}`;
    case "membershipChange":
      return `membership - ${content.userId} ${content.change}`;
    case "profileChange":
      return `profile - ${content.displayNameChange ?? "unchanged"}`;
    case "state":
      return `state - ${content.eventType}`;
    case "virtual":
      return `virtual - ${content.kind}`;
    case "unknown":
      return "unknown";
  }
}

// #endregion

function RoomHeader({ spaceId, roomId }: { spaceId: string; roomId: string }) {
  const roomsSub = useRoomsInSpace(spaceId);
  const room = (roomsSub.value ?? []).find((r) => r.roomId === roomId);

  return (
    <div className="flex items-center gap-2">
      <Hash size={16} className="text-surface-500" />
      <h2 className="text-sm font-semibold text-surface-950-50">
        {room?.displayName ?? "Unknown"}
      </h2>
    </div>
  );
}

const ConnectedTimeline = forwardRef<
  MessageListHandle,
  {
    roomId: string;
    debug: boolean;
    onReply: (event: TimelineEventData) => void;
  }
>(function ConnectedTimeline({ roomId, debug, onReply }, ref) {
  const events = useTimeline(roomId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const session = useSession();
  const currentUserId = session.data?.userId;

  const handleLoadMore = useCallback(async () => {
    const result = await paginateTimeline({ roomId, direction: "backward", count: 50 });
    return result.ok ? result.value.exhausted : true;
  }, [roomId]);

  const handleToggleReaction = useCallback(
    (eventId: string, key: string) => {
      void toggleReaction({ roomId, eventId, transactionId: null, key });
    },
    [roomId],
  );

  const handleDeleteMessage = useCallback(
    (event: TimelineEventData) => {
      void redactMessage({
        room: roomId,
        event: event.id ?? null,
        transaction: event.transactionId ?? null,
      });
    },
    [roomId],
  );

  function handleEditMessage(event: TimelineEventData) {
    setEditingId(event.id ?? event.transactionId ?? null);
  }

  function handleEdit(target: EditTarget, body: string, html: string) {
    void editMessage({
      roomId,
      eventId: target.eventId ?? null,
      transactionId: target.transactionId ?? null,
      body,
      formattedBody: html,
    });
    setEditingId(null);
  }

  function renderEditor(event: TimelineEventData) {
    if (event.content.type !== "message") return null;
    return (
      <EditComposer
        target={{
          eventId: event.id ?? undefined,
          transactionId: event.transactionId ?? undefined,
        }}
        content={event.content.formattedBody ?? event.content.body}
        onEdit={handleEdit}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  if (debug) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <ul className="space-y-1 font-mono text-sm text-surface-950-50">
          {events.map((event: TimelineEventData, i: number) => (
            <li
              key={event.id ?? i}
              className={
                event.sendState?.state === "notSentYet"
                  ? "opacity-50 transition-opacity duration-300"
                  : "transition-opacity duration-300"
              }
            >
              <span className="text-surface-500">{event.senderName ?? event.sender}</span>{" "}
              {formatContent(event.content)}
              {event.sendState && (
                <span className="text-surface-400"> [{event.sendState.state}]</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <MessageList
      ref={ref}
      events={events}
      onLoadMore={handleLoadMore}
      onReplyMessage={onReply}
      onEditMessage={handleEditMessage}
      onDeleteMessage={handleDeleteMessage}
      editingEventId={editingId}
      renderEditor={renderEditor}
      currentUserId={currentUserId}
      onToggleReaction={handleToggleReaction}
      onJumpToEvent={(eventId) =>
        void focusOnEvent({ roomId, targetEventId: eventId, numContextEvents: null })
      }
    />
  );
});

function ConnectedMemberList({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const membersSub = useMembers(roomId);
  const members = membersSub.value ?? [];
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const sorted = [...members].sort((a, b) =>
    (a.displayName ?? a.userId).localeCompare(b.displayName ?? b.userId),
  );

  const content = (
    <MemberList className="h-full">
      <MemberList.Header>Members — {sorted.length}</MemberList.Header>
      <div className="flex-1 overflow-y-auto">
        <MemberList.List>
          {sorted.map((member) => (
            <MemberList.Row
              key={member.userId}
              name={member.displayName ?? member.userId}
              avatarUrl={member.avatarUrl}
            />
          ))}
        </MemberList.List>
      </div>
    </MemberList>
  );

  return (
    <>
      <div className="hidden md:flex">
        <Transition open={open}>{content}</Transition>
      </div>

      {!isDesktop && (
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
          <Drawer.Portal>
            <Drawer.Overlay />
            <Drawer.Content className="right-0 rounded-l-xl w-70">{content}</Drawer.Content>
          </Drawer.Portal>
        </Drawer>
      )}
    </>
  );
}

const MEMBER_PANEL_KEY = "harmony_members_open";

function useMembersPanelOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(MEMBER_PANEL_KEY);
    if (stored !== null) return stored === "true";
    if (typeof window !== "undefined" && "matchMedia" in window) {
      return window.matchMedia("(min-width: 768px)").matches;
    }
    return true;
  });

  const set = useCallback((next: boolean) => {
    setOpen(next);
    localStorage.setItem(MEMBER_PANEL_KEY, String(next));
  }, []);

  return [open, set];
}

async function getMembersForComposer(roomId: string) {
  const result = await getMembers(roomId);
  return result.ok ? result.value : [];
}

function TimelineView() {
  const { spaceId, roomId } = useParams({
    from: "/_authenticated/_chat/$spaceId/$roomId",
  });
  const [debug, setDebug] = useState(false);
  const [membersOpen, setMembersOpen] = useMembersPanelOpen();
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const navContext = useContext(NavContext);
  const composerRef = useRef<ComposerHandle>(null);
  const messageListRef = useRef<MessageListHandle>(null);

  const handleReply = useCallback((event: TimelineEventData) => {
    const eventId = event.id;
    if (!eventId) return;
    const body = event.content.type === "message" ? event.content.body : null;
    setReplyTarget({
      eventId,
      sender: event.sender,
      senderName: event.senderName,
      body,
      redacted: false,
    });
    composerRef.current?.focus();
  }, []);

  useEffect(() => {
    setReplyTarget(null);
  }, [roomId]);

  useEffect(() => {
    markRoomAsRead(roomId);
  }, [roomId]);

  useEffect(() => {
    setLastRoom(spaceId, roomId);
    recordUsage({ id: roomId, kind: "room" });
  }, [spaceId, roomId]);

  useRoomCommands(spaceId, roomId);

  useOmnibarCommands(
    [
      {
        id: "view.toggle-members",
        label: membersOpen ? "Hide members panel" : "Show members panel",
        icon: PanelRight,
        keywords: ["sidebar", "panel", "list", "toggle", "members"],
        perform: () => setMembersOpen(!membersOpen),
      },
      ...(import.meta.env.DEV
        ? [
            {
              id: "debug.toggle-timeline",
              label: debug ? "Disable debug view" : "Enable debug view",
              icon: Bug,
              keywords: ["enable", "disable", "pretty", "raw", "json", "toggle"],
              perform: () => setDebug((d) => !d),
            },
          ]
        : []),
    ],
    [membersOpen, debug],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;

      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      composerRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((files) => composerRef.current?.addFiles(files), []),
  );

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="relative flex flex-1 flex-col min-h-0 min-w-0" {...dropZoneProps}>
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary-500 bg-primary-500/10 backdrop-blur-[1px]">
            <div className="rounded-xl bg-surface-100-900 px-6 py-4 text-center shadow-xl">
              <p className="text-base font-semibold text-surface-950-50">Drop files to upload</p>
              <p className="mt-0.5 text-xs text-surface-500">Release to add to message</p>
            </div>
          </div>
        )}
        <header
          data-scope="room"
          data-part="header"
          className="flex items-center gap-2 border-b border-surface-200-800 px-4 py-2"
        >
          <button
            type="button"
            className="md:hidden text-surface-500 transition-colors hover:text-surface-950-50 mr-2"
            onClick={() => navContext?.setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <RoomHeader spaceId={spaceId} roomId={roomId} />
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMembersOpen(!membersOpen)}
              aria-label={membersOpen ? "Hide members" : "Show members"}
              aria-pressed={membersOpen}
              className="text-surface-500 transition-colors hover:text-surface-950-50 aria-pressed:text-surface-950-50"
            >
              <Users size={16} />
            </button>
          </div>
        </header>

        <ConnectedTimeline
          ref={messageListRef}
          roomId={roomId}
          debug={debug}
          onReply={handleReply}
        />

        <div className="border-t border-surface-200-800 p-4">
          <Composer
            ref={composerRef}
            roomId={roomId}
            getMembers={getMembersForComposer}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            onSend={async (body, html, files) => {
              const attachments =
                files.length > 0
                  ? await Promise.all(
                      files.map(async (file) =>
                        buildAttachment(file, (await mediaUpload(file)).mxUrl),
                      ),
                    )
                  : null;
              void sendMessage({
                roomId,
                body,
                formattedBody: html,
                replyToEventId: replyTarget?.eventId ?? null,
                attachments,
              });
              setReplyTarget(null);
              messageListRef.current?.scrollToBottom();
            }}
          />
        </div>
      </div>

      <ConnectedMemberList roomId={roomId} open={membersOpen} onOpenChange={setMembersOpen} />
    </div>
  );
}
