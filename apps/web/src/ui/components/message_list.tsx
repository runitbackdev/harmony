import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  memo,
} from "react";
import type { HTMLAttributes } from "react";
import { useLongPress } from "@react-aria/interactions";
import { ScrollArea } from "@runitbk/react";
import type { TimelineEventData as TimelineEvent } from "@harmony/harmony-bindings-web";
import { cn } from "../utils";
import { useTimelineController } from "../timeline/use_timeline_controller";
import { MessageActionBar } from "./message_action_bar";
import { MessageContextMenu, type MessageMenuItem } from "./message_context_menu";
import { MessageEvent } from "./message_event";
import { ReactionDisplay } from "./reaction_display";
import { SystemEvent } from "./system_event";
import { DateDivider, ReadMarker, TimelineStart } from "./timeline_divider";

const SCROLL_IDLE_MS = 150;

// #region Helpers

function formatSystemContent(event: TimelineEvent): string | null {
  switch (event.content.type) {
    case "membershipChange": {
      const name = event.senderName ?? event.sender ?? "Someone";
      return `${name} ${event.content.change}`;
    }
    case "profileChange": {
      const name = event.senderName ?? event.sender ?? "Someone";
      const change = event.content.displayNameChange ?? "updated their profile";
      return `${name} ${change}`;
    }
    case "state":
      return `State event: ${event.content.eventType}`;
    default:
      return null;
  }
}

function isPending(event: TimelineEvent): boolean {
  return event.sendState?.state === "notSentYet";
}

// #endregion

// #region MessageRow

interface MessageRowProps {
  event: TimelineEvent;
  grouped: boolean;
  flashing: boolean;
  index: number;
  currentUserId?: string;
  editingNode?: React.ReactNode;
  onToggleReaction?: (eventId: string, key: string) => void;
  onPointerEnter: (event: TimelineEvent, index: number, el: HTMLElement) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onShowContextMenu: (event: TimelineEvent, x: number, y: number) => void;
  onReplyClick?: (eventId: string) => void;
}

const MessageRow = memo(function MessageRow({
  event,
  grouped,
  flashing,
  index,
  currentUserId,
  editingNode,
  onToggleReaction,
  onPointerEnter,
  onPointerLeave,
  onShowContextMenu,
  onReplyClick,
}: MessageRowProps) {
  const { longPressProps } = useLongPress({
    threshold: 500,
    onLongPress: (e) => {
      if (e.pointerType !== "touch") return;
      if (event.content.type !== "message") return;
      onShowContextMenu(event, e.x, e.y);
    },
  });
  function renderContent() {
    if (event.content.type === "virtual") {
      const kind = event.content.kind;
      if (kind.startsWith("date_divider:")) {
        return <DateDivider timestamp={Number(kind.slice("date_divider:".length))} />;
      }
      if (kind === "read_marker") return <ReadMarker />;
      if (kind === "timeline_start") return <TimelineStart />;
      return null;
    }

    if (event.content.type === "message") {
      const mentions = event.content.mentions;
      const highlight =
        !!currentUserId &&
        !!mentions &&
        (mentions.everyone || mentions.userIds.includes(currentUserId));

      return (
        <MessageEvent
          sender={event.senderName ?? event.sender ?? "Unknown"}
          body={event.content.body}
          formattedBody={event.content.formattedBody}
          timestamp={event.timestamp}
          avatar={event.senderAvatar}
          pending={isPending(event)}
          grouped={grouped}
          highlight={highlight}
          edited={event.content.edited}
          editing={editingNode}
          replyTo={event.replyTo}
          onReplyClick={onReplyClick}
          reactions={
            event.reactions && event.reactions.length > 0 ? (
              <ReactionDisplay
                reactions={event.reactions}
                currentUserId={currentUserId}
                onToggleReaction={
                  onToggleReaction && event.id
                    ? (key) => onToggleReaction(event.id!, key)
                    : undefined
                }
              />
            ) : undefined
          }
          attachments={event.content.attachments ?? undefined}
        />
      );
    }

    const systemText = formatSystemContent(event);
    if (systemText) return <SystemEvent content={systemText} />;
    return null;
  }

  return (
    <div
      data-scope="message-row"
      data-part="root"
      data-event-id={event.id ?? undefined}
      data-flash={flashing ? "" : undefined}
      style={{
        overflowAnchor: "none",
        WebkitTouchCallout: "none",
      }}
      className={cn(
        "px-4 transition-colors duration-700 data-flash:bg-accent/20",
        !editingNode && "hover:bg-soft data-active:bg-soft",
      )}
      {...longPressProps}
      onPointerEnter={(e) => {
        longPressProps.onPointerEnter?.(e);
        onPointerEnter(event, index, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        longPressProps.onPointerLeave?.(e);
        onPointerLeave(e);
      }}
      onContextMenu={(e) => {
        if (event.content.type !== "message") return;
        e.preventDefault();
        onShowContextMenu(event, e.clientX, e.clientY);
      }}
    >
      {renderContent()}
    </div>
  );
});

// #endregion

// #region ActionBarOverlay

type Target = { anchor: HTMLElement; event: TimelineEvent };

interface ActionBarHandle {
  show: (anchor: HTMLElement, event: TimelineEvent) => void;
  hide: () => void;
}

interface ActionBarOverlayProps {
  currentUserId?: string;
  editingEventId?: string | null;
  onReplyMessage?: (event: TimelineEvent) => void;
  onEditMessage?: (event: TimelineEvent) => void;
  onDeleteMessage?: (event: TimelineEvent) => void;
  onToggleReaction?: (eventId: string, key: string) => void;
}

const ActionBarOverlay = forwardRef<ActionBarHandle, ActionBarOverlayProps>(
  function ActionBarOverlay(
    {
      currentUserId,
      editingEventId,
      onReplyMessage,
      onEditMessage,
      onDeleteMessage,
      onToggleReaction,
    },
    ref,
  ) {
    const [current, setCurrent] = useState<Target | null>(null);
    // Keep the last target around so the close animation has an anchor to position against
    // even after `current` flips to null.
    const [lastTarget, setLastTarget] = useState<Target | null>(null);
    const currentRef = useRef<Target | null>(null);

    const close = useCallback(() => {
      const prev = currentRef.current;
      if (prev) prev.anchor.removeAttribute("data-active");
      currentRef.current = null;
      setCurrent(null);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        show: (anchor, event) => {
          const prev = currentRef.current;
          if (prev && prev.anchor !== anchor) prev.anchor.removeAttribute("data-active");
          anchor.setAttribute("data-active", "");
          const next = { anchor, event };
          currentRef.current = next;
          setCurrent(next);
          setLastTarget(next);
        },
        hide: close,
      }),
      [close],
    );

    // When the currently-shown row enters edit mode, fully close so the bar doesn't
    // reappear after editing ends (and so `data-active` is cleared on the row).
    useEffect(() => {
      if (!current || editingEventId == null) return;
      const matches =
        current.event.id === editingEventId || current.event.transactionId === editingEventId;
      if (matches) close();
    }, [current, editingEventId, close]);

    if (!lastTarget) return null;

    const { anchor, event } = lastTarget;
    const isOwn = !!currentUserId && event.sender === currentUserId;
    const isEditing =
      editingEventId != null &&
      (event.id === editingEventId || event.transactionId === editingEventId);

    return (
      <MessageActionBar
        anchor={anchor}
        isOwn={isOwn}
        open={!!current && !isEditing}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        onReply={onReplyMessage ? () => onReplyMessage(event) : undefined}
        onEdit={isOwn && onEditMessage ? () => onEditMessage(event) : undefined}
        onDelete={isOwn && onDeleteMessage ? () => onDeleteMessage(event) : undefined}
        onToggleReaction={
          onToggleReaction
            ? (key: string) => onToggleReaction(event.id ?? event.transactionId ?? "", key)
            : undefined
        }
      />
    );
  },
);

// #endregion

// #region ContextMenuOverlay

type ContextMenuTarget = { event: TimelineEvent; x: number; y: number };

interface ContextMenuOverlayHandle {
  show: (event: TimelineEvent, x: number, y: number) => void;
  hide: () => void;
}

interface ContextMenuOverlayProps {
  currentUserId?: string;
  onReplyMessage?: (event: TimelineEvent) => void;
  onEditMessage?: (event: TimelineEvent) => void;
  onDeleteMessage?: (event: TimelineEvent) => void;
  getExtras?: (event: TimelineEvent) => readonly MessageMenuItem[];
}

const ContextMenuOverlay = forwardRef<ContextMenuOverlayHandle, ContextMenuOverlayProps>(
  function ContextMenuOverlay(
    { currentUserId, onReplyMessage, onEditMessage, onDeleteMessage, getExtras },
    ref,
  ) {
    const [current, setCurrent] = useState<ContextMenuTarget | null>(null);
    const [last, setLast] = useState<ContextMenuTarget | null>(null);

    const close = useCallback(() => setCurrent(null), []);

    useImperativeHandle(
      ref,
      () => ({
        show: (event, x, y) => {
          const next = { event, x, y };
          setCurrent(next);
          setLast(next);
        },
        hide: close,
      }),
      [close],
    );

    if (!last) return null;

    const { event } = last;
    if (event.content.type !== "message") return null;

    const isOwn = !!currentUserId && event.sender === currentUserId;

    return (
      <MessageContextMenu
        open={!!current}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        virtualAnchor={current ? { x: current.x, y: current.y } : null}
        isOwn={isOwn}
        body={event.content.body}
        onReply={onReplyMessage ? () => onReplyMessage(event) : undefined}
        onEdit={isOwn && onEditMessage ? () => onEditMessage(event) : undefined}
        onDelete={isOwn && onDeleteMessage ? () => onDeleteMessage(event) : undefined}
        extras={getExtras?.(event)}
      />
    );
  },
);

// #endregion

// #region MessageList

export interface MessageListHandle {
  scrollToBottom: () => void;
}

interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  currentUserId?: string;
  events: TimelineEvent[];
  onLoadMore?: () => Promise<boolean>;
  onReplyMessage?: (event: TimelineEvent) => void;
  onEditMessage?: (event: TimelineEvent) => void;
  onDeleteMessage?: (event: TimelineEvent) => void;
  editingEventId?: string | null;
  renderEditor?: (event: TimelineEvent) => React.ReactNode;
  onToggleReaction?: (eventId: string, key: string) => void;
  /** Called when a reply quote is clicked and target is not in the current timeline window. */
  onJumpToEvent?: (eventId: string) => void;
  /** Per-event additional context menu items. */
  getContextMenuExtras?: (event: TimelineEvent) => readonly MessageMenuItem[];
}

const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  {
    events,
    onLoadMore,
    onReplyMessage,
    onEditMessage,
    onDeleteMessage,
    editingEventId,
    renderEditor,
    className,
    currentUserId,
    onToggleReaction,
    onJumpToEvent,
    getContextMenuExtras,
    ...props
  },
  ref,
) {
  const {
    scrollRef,
    totalSize,
    rows,
    newCount,
    scrollToBottom,
    jumpToEvent,
    handleScroll: onTimelineScroll,
  } = useTimelineController({ events, onLoadMore, onJumpToEvent });

  const actionBarRef = useRef<ActionBarHandle>(null);
  const contextMenuRef = useRef<ContextMenuOverlayHandle>(null);

  const handlePointerEnter = useCallback((event: TimelineEvent, _i: number, el: HTMLElement) => {
    if (event.content.type !== "message") return;
    actionBarRef.current?.show(el, event);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if ("emojiPickerOpen" in document.documentElement.dataset) return;
    const related = e.relatedTarget;
    if (related instanceof Element) {
      // Pointer moved to the action bar — keep current active so the bar stays open.
      const actionBar = document.querySelector('[data-scope="message-action-bar"]');
      if (actionBar?.contains(related)) return;
      // Pointer moved to another row — let that row's enter handler set the new active.
      if (related.closest('[data-scope="message-row"]')) return;
    }
    actionBarRef.current?.hide();
  }, []);

  const handleShowContextMenu = useCallback((event: TimelineEvent, x: number, y: number) => {
    if (event.content.type !== "message") return;
    actionBarRef.current?.hide();
    contextMenuRef.current?.show(event, x, y);
  }, []);

  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    actionBarRef.current?.hide();
    contextMenuRef.current?.hide();
    container.style.pointerEvents = "none";

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      container.style.pointerEvents = "";
    }, SCROLL_IDLE_MS);

    onTimelineScroll();
  }, [scrollRef, onTimelineScroll]);

  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  return (
    <ScrollArea.Root
      data-scope="message-list"
      data-part="root"
      className={cn("flex-1 min-h-0", className)}
      {...props}
    >
      <ScrollArea.Viewport
        ref={scrollRef}
        data-scope="message-list"
        data-part="viewport"
        style={{ overflowAnchor: "none" }}
        onScroll={handleScroll}
      >
        {newCount > 0 && (
          <button
            type="button"
            data-scope="message-list"
            data-part="new-messages"
            onClick={scrollToBottom}
            className="sticky top-0 z-10 flex w-full cursor-pointer items-center justify-center gap-1 bg-accent py-1 text-data font-medium text-accent-ink"
          >
            {newCount} new {newCount === 1 ? "message" : "messages"} — Jump to latest
          </button>
        )}
        <div style={{ height: totalSize, position: "relative", width: "100%" }}>
          {rows.map((row) => {
            const isEditing =
              editingEventId != null &&
              renderEditor != null &&
              (row.event.id === editingEventId || row.event.transactionId === editingEventId);

            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={row.measureRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <MessageRow
                  event={row.event}
                  grouped={row.grouped}
                  flashing={row.flashing}
                  index={row.index}
                  currentUserId={currentUserId}
                  editingNode={isEditing ? renderEditor(row.event) : undefined}
                  onToggleReaction={onToggleReaction}
                  onPointerEnter={handlePointerEnter}
                  onPointerLeave={handlePointerLeave}
                  onShowContextMenu={handleShowContextMenu}
                  onReplyClick={jumpToEvent}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>

      <ActionBarOverlay
        ref={actionBarRef}
        currentUserId={currentUserId}
        editingEventId={editingEventId}
        onReplyMessage={onReplyMessage}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onToggleReaction={onToggleReaction}
      />
      <ContextMenuOverlay
        ref={contextMenuRef}
        currentUserId={currentUserId}
        onReplyMessage={onReplyMessage}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        getExtras={getContextMenuExtras}
      />
    </ScrollArea.Root>
  );
});

// #endregion

export { MessageList };
