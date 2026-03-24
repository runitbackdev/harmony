import { useMemo, useRef } from "react";
import type { HTMLAttributes } from "react";
import type { TimelineEvent } from "@harmony/protocol";
import { cn } from "../utils";
import { useLoadMoreOnScroll, useStickToBottom } from "../hooks/scroll";
import { MessageEvent } from "./message_event";
import { SystemEvent } from "./system_event";
import { DateDivider, ReadMarker, TimelineStart } from "./timeline_divider";

const GROUP_INTERVAL_MS = 8 * 60 * 1000;
const INTRINSIC_ITEM_HEIGHT = "auto 40px";

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

// #region MessageList

interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  currentUserId?: string;
  events: TimelineEvent[];
  onLoadMore?: () => Promise<boolean>;
}

function renderEvent(event: TimelineEvent, grouped: boolean, currentUserId?: string) {
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
    const highlight = !!currentUserId && !!mentions && (mentions.everyone || mentions.userIds.includes(currentUserId));

    return (
      <MessageEvent
        sender={event.senderName ?? event.sender ?? "Unknown"}
        body={event.content.body}
        timestamp={event.timestamp}
        avatar={event.senderAvatar}
        pending={isPending(event)}
        grouped={grouped}
        highlight={highlight}
      />
    );
  }

  const systemText = formatSystemContent(event);
  if (systemText) return <SystemEvent content={systemText} />;

  return null;
}

function MessageList({ events, onLoadMore, className, currentUserId, ...props }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => events.filter((event) => event.content.type !== "unknown"),
    [events],
  );

  const grouping = useMemo(() => computeGrouping(filtered), [filtered]);

  useStickToBottom(containerRef, filtered.length);
  useLoadMoreOnScroll(containerRef, sentinelRef, onLoadMore);

  return (
    <div
      data-scope="message-list"
      data-part="root"
      ref={containerRef}
      className={cn("flex-1 overflow-y-auto", className)}
      {...props}
    >
      <div ref={sentinelRef} data-scope="message-list" data-part="sentinel" />
      {filtered.map((event, i) => (
        <div
          key={event.id ?? `pending-${i}`}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: INTRINSIC_ITEM_HEIGHT,
          }}
          className="px-4"
        >
          {renderEvent(event, grouping[i], currentUserId)}
        </div>
      ))}
    </div>
  );
}

// #endregion

export { MessageList };
