import { forwardRef, useCallback, useEffect, useRef, useState, useContext } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import {
  editMessage,
  focusOnEvent,
  getMembers,
  markAsRead,
  paginateTimeline,
  redactMessage,
  sendMessage,
  subscribeMembers,
  subscribeTimeline,
  toggleReaction,
  useMembers,
  useReactions,
  useRooms,
  useTimeline,
  getSession,
} from "@harmony/react";
import {
  Drawer,
  MemberList,
  MessageList,
  type MessageListHandle,
  ReactionDisplay,
} from "@harmony/ui";
import { Transition, useMediaQuery } from "@harmony/primitives";
import { Composer, EditComposer } from "@harmony/composer";
import type { ComposerHandle, EditTarget } from "@harmony/composer";
import { Bug, Hash, Menu, PanelRight, Users } from "lucide-react";
import type { ReactionGroup, ReplyTarget, TimelineContent, TimelineEvent } from "@harmony/protocol";
import { setLastRoom } from "@/lib/last-room";
import { useOmnibarCommands } from "@/omnibar";
import { recordUsage } from "@/omnibar/store";
import { useRoomCommands } from "@/rooms/commands";
import { NavContext } from "./route";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId/$roomId")({
  loader: async ({ params }) => {
    await Promise.all([subscribeTimeline(params.roomId), subscribeMembers(params.roomId)]);
  },
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

const EMPTY_REACTIONS: ReactionGroup[] = [];

function ConnectedReactions({ eventId }: { eventId: string }) {
  const { roomId } = useParams({
    from: "/_authenticated/_chat/$spaceId/$roomId",
  });
  const reactions = useReactions(eventId);
  return (
    <ReactionDisplay
      reactions={reactions ?? EMPTY_REACTIONS}
      currentUserId={getSession()?.userId}
      onToggleReaction={(key) => void toggleReaction(roomId, { eventId }, key)}
    />
  );
}

function RoomHeader({ roomId }: { roomId: string }) {
  const rooms = useRooms();
  const room = rooms.find((r) => r.roomId === roomId);

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
    onReply: (event: TimelineEvent) => void;
  }
>(function ConnectedTimeline({ roomId, debug, onReply }, ref) {
  const events = useTimeline();
  const [editingId, setEditingId] = useState<string | null>(null);
  const currentUserId = getSession()?.userId;
  const handleLoadMore = useCallback(
    () => paginateTimeline(roomId).then((r) => r.exhausted),
    [roomId],
  );

  const handleToggleReaction = useCallback(
    (eventId: string, key: string) => {
      void toggleReaction(roomId, { eventId }, key);
    },
    [roomId],
  );

  const handleDeleteMessage = useCallback(
    (event: TimelineEvent) => {
      const eventId = event.id ?? undefined;
      const transactionId = event.transactionId ?? undefined;
      void redactMessage(roomId, { eventId, transactionId });
    },
    [roomId],
  );

  function handleEditMessage(event: TimelineEvent) {
    setEditingId(event.id ?? event.transactionId ?? null);
  }

  function handleEdit(target: EditTarget, body: string, html: string) {
    void editMessage(roomId, target, body, html);
    setEditingId(null);
  }

  function renderEditor(event: TimelineEvent) {
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
          {events.map((event, i) => (
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
      onJumpToEvent={(eventId) => void focusOnEvent(roomId, eventId)}
      ReactionSlot={ConnectedReactions}
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
  const members = useMembers();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const sorted = [...members].sort((a, b) =>
    (a.displayName ?? a.userId).localeCompare(b.displayName ?? b.userId),
  );
  void roomId;

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

  const handleReply = useCallback((event: TimelineEvent) => {
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
    void markAsRead(roomId);
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

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
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

          <RoomHeader roomId={roomId} />
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
            getMembers={getMembers}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            onSend={(body, html) => {
              void sendMessage(roomId, body, html, replyTarget?.eventId);
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
