import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import type { HTMLAttributes } from "react";
import { useLongPress } from "@react-aria/interactions";
import type { TimelineEvent } from "@harmony/protocol";
import { cn } from "../utils";
import { useLoadMoreOnScroll, useNewMessageIndicator, useStickToBottom } from "../hooks/scroll";
import { MessageActionBar } from "./message_action_bar";
import { MessageContextMenu, type MessageMenuItem } from "./message_context_menu";
import { MessageEvent } from "./message_event";
import { SystemEvent } from "./system_event";
import { DateDivider, ReadMarker, TimelineStart } from "./timeline_divider";

const GROUP_INTERVAL_MS = 8 * 60 * 1000;
const INTRINSIC_ITEM_HEIGHT = "auto 40px";
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

function computeGrouping(events: TimelineEvent[]) {
  const grouped: boolean[] = [];
  let groupStartTime = 0;

  for (let i = 0; i < events.length; i++) {
    const curr = events[i];
    const prev = i > 0 ? events[i - 1] : null;
    const sameGroup =
      prev?.content.type === "message" &&
      curr.content.type === "message" &&
      prev.sender === curr.sender &&
      curr.timestamp - groupStartTime < GROUP_INTERVAL_MS;

    if (!sameGroup) groupStartTime = curr.timestamp;
    grouped.push(sameGroup);
  }
  return grouped;
}

function isPending(event: TimelineEvent): boolean {
  return event.sendState?.state === "notSentYet";
}

function eventKey(event: TimelineEvent, index: number): string {
  return event.id ?? `pending-${index}`;
}

// #endregion

// #region MessageRow

export type ReactionSlotProps = { eventId: string };

interface MessageRowProps {
  event: TimelineEvent;
  grouped: boolean;
  index: number;
  currentUserId?: string;
  editingNode?: React.ReactNode;
  ReactionSlot?: React.ComponentType<ReactionSlotProps>;
  onPointerEnter: (event: TimelineEvent, index: number, el: HTMLElement) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onShowContextMenu: (event: TimelineEvent, x: number, y: number) => void;
}

const MessageRow = memo(function MessageRow({
  event,
  grouped,
  index,
  currentUserId,
  editingNode,
  ReactionSlot,
  onPointerEnter,
  onPointerLeave,
  onShowContextMenu,
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
          reactions={ReactionSlot && event.id ? <ReactionSlot eventId={event.id} /> : undefined}
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
      data-index={index}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: INTRINSIC_ITEM_HEIGHT,
        overflowAnchor: "none",
        WebkitTouchCallout: "none",
      }}
      className={cn(
        "px-4",
        !editingNode && "hover:bg-surface-100-900 data-active:bg-surface-100-900",
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
  onEditMessage?: (event: TimelineEvent) => void;
  onDeleteMessage?: (event: TimelineEvent) => void;
  onToggleReaction?: (eventId: string, key: string) => void;
}

const ActionBarOverlay = forwardRef<ActionBarHandle, ActionBarOverlayProps>(
  function ActionBarOverlay(
    { currentUserId, editingEventId, onEditMessage, onDeleteMessage, onToggleReaction },
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
  ReactionSlot?: React.ComponentType<ReactionSlotProps>;
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
    ReactionSlot,
    className,
    currentUserId,
    onToggleReaction,
    getContextMenuExtras,
    ...props
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
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
    const container = containerRef.current;
    if (!container) return;

    actionBarRef.current?.hide();
    contextMenuRef.current?.hide();
    container.style.pointerEvents = "none";

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      container.style.pointerEvents = "";
    }, SCROLL_IDLE_MS);
  }, []);

  const filtered = useMemo(
    () => events.filter((event) => event.content.type !== "unknown"),
    [events],
  );

  const grouping = useMemo(() => computeGrouping(filtered), [filtered]);

  const { isAtBottom, scrollToBottom } = useStickToBottom(containerRef, anchorRef, filtered.length);
  const { newCount } = useNewMessageIndicator(isAtBottom, filtered.length);
  useLoadMoreOnScroll(containerRef, sentinelRef, onLoadMore);

  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  return (
    <div
      data-scope="message-list"
      data-part="root"
      ref={containerRef}
      className={cn("relative flex-1 overflow-y-auto", className)}
      onScroll={handleScroll}
      {...props}
    >
      {newCount > 0 && (
        <button
          type="button"
          data-scope="message-list"
          data-part="new-messages"
          onClick={scrollToBottom}
          className="sticky top-0 z-10 flex w-full cursor-pointer items-center justify-center gap-1 bg-primary-500 py-1 text-xs font-medium text-on-primary"
        >
          {newCount} new {newCount === 1 ? "message" : "messages"} — Jump to latest
        </button>
      )}
      <div ref={sentinelRef} data-scope="message-list" data-part="sentinel" />
      {filtered.map((event, i) => {
        const rowKey = eventKey(event, i);
        const isEditing =
          editingEventId != null &&
          renderEditor != null &&
          (event.id === editingEventId || event.transactionId === editingEventId);

        return (
          <MessageRow
            key={rowKey}
            event={event}
            grouped={grouping[i]}
            index={i}
            currentUserId={currentUserId}
            editingNode={isEditing ? renderEditor(event) : undefined}
            ReactionSlot={ReactionSlot}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onShowContextMenu={handleShowContextMenu}
          />
        );
      })}
      <div
        ref={anchorRef}
        data-scope="message-list"
        data-part="anchor"
        style={{ overflowAnchor: "auto" }}
        className="pb-4"
      />

      <ActionBarOverlay
        ref={actionBarRef}
        currentUserId={currentUserId}
        editingEventId={editingEventId}
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
    </div>
  );
});

// #endregion

export { MessageList };
