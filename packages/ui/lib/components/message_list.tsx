import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import type { HTMLAttributes } from "react";
import type { TimelineEvent } from "@harmony/protocol";
import { cn } from "../utils";
import { useLoadMoreOnScroll, useStickToBottom } from "../hooks/scroll";
import { MessageActionBar } from "./message_action_bar";
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
}: MessageRowProps) {
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
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: INTRINSIC_ITEM_HEIGHT,
        overflowAnchor: "none",
      }}
      className="px-4 hover:bg-surface-100-900 data-hovered:bg-surface-100-900"
      onPointerEnter={(e) => onPointerEnter(event, index, e.currentTarget)}
      onPointerLeave={onPointerLeave}
    >
      {renderContent()}
    </div>
  );
});

// #endregion

// #region ActionBarOverlay

interface ActionBarHandle {
  show: (anchor: HTMLElement, event: TimelineEvent) => void;
  hide: () => void;
}

interface ActionBarOverlayProps {
  currentUserId?: string;
  editingEventId?: string | null;
  onEditMessage?: (event: TimelineEvent) => void;
  onToggleReaction?: (eventId: string, key: string) => void;
}

const ActionBarOverlay = forwardRef<ActionBarHandle, ActionBarOverlayProps>(
  function ActionBarOverlay(
    { currentUserId, editingEventId, onEditMessage, onToggleReaction },
    ref,
  ) {
    const [hover, setHover] = useState<{ anchor: HTMLElement; event: TimelineEvent } | null>(null);

    useImperativeHandle(ref, () => ({
      show: (anchor, event) => setHover({ anchor, event }),
      hide: () => {
        setHover((prev) => {
          prev?.anchor.removeAttribute("data-hovered");
          return null;
        });
      },
    }));

    if (!hover) return null;

    const { anchor, event } = hover;
    const isOwn = !!currentUserId && event.sender === currentUserId;
    const isEditing =
      editingEventId != null &&
      (event.id === editingEventId || event.transactionId === editingEventId);

    if (isEditing) return null;

    return (
      <MessageActionBar
        anchor={anchor}
        isOwn={isOwn}
        onDismiss={() => {
          anchor.removeAttribute("data-hovered");
          setHover(null);
        }}
        onEdit={isOwn && onEditMessage ? () => onEditMessage(event) : undefined}
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

// #region MessageList

interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  currentUserId?: string;
  events: TimelineEvent[];
  onLoadMore?: () => Promise<boolean>;
  onEditMessage?: (event: TimelineEvent) => void;
  editingEventId?: string | null;
  renderEditor?: (event: TimelineEvent) => React.ReactNode;
  onToggleReaction?: (eventId: string, key: string) => void;
  ReactionSlot?: React.ComponentType<ReactionSlotProps>;
}

function MessageList({
  events,
  onLoadMore,
  onEditMessage,
  editingEventId,
  renderEditor,
  ReactionSlot,
  className,
  currentUserId,
  onToggleReaction,
  ...props
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<ActionBarHandle>(null);
  const hoveredAnchorRef = useRef<HTMLElement | null>(null);

  const handlePointerEnter = useCallback((event: TimelineEvent, _: number, el: HTMLElement) => {
    if (event.content.type !== "message") return;
    hoveredAnchorRef.current?.removeAttribute("data-hovered");
    el.setAttribute("data-hovered", "");
    hoveredAnchorRef.current = el;
    actionBarRef.current?.show(el, event);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if ("emojiPickerOpen" in document.documentElement.dataset) return;
    const related = e.relatedTarget;
    if (related instanceof Node) {
      const actionBar = document.querySelector('[data-scope="message-action-bar"]');
      if (actionBar?.contains(related)) return;
    }
    hoveredAnchorRef.current = null;
    actionBarRef.current?.hide();
  }, []);

  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    hoveredAnchorRef.current?.removeAttribute("data-hovered");
    hoveredAnchorRef.current = null;
    actionBarRef.current?.hide();
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

  useStickToBottom(containerRef, anchorRef, filtered.length);
  useLoadMoreOnScroll(containerRef, sentinelRef, onLoadMore);

  return (
    <div
      data-scope="message-list"
      data-part="root"
      ref={containerRef}
      className={cn("flex-1 overflow-y-auto", className)}
      onScroll={handleScroll}
      {...props}
    >
      <div ref={sentinelRef} data-scope="message-list" data-part="sentinel" />
      {filtered.map((event, i) => {
        const isEditing =
          editingEventId != null &&
          renderEditor != null &&
          (event.id === editingEventId || event.transactionId === editingEventId);

        return (
          <MessageRow
            key={event.id ?? `pending-${i}`}
            event={event}
            grouped={grouping[i]}
            index={i}
            currentUserId={currentUserId}
            editingNode={isEditing ? renderEditor(event) : undefined}
            ReactionSlot={ReactionSlot}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
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
        onToggleReaction={onToggleReaction}
      />
    </div>
  );
}

// #endregion

export { MessageList };
