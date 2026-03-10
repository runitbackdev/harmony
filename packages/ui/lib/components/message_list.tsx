import { useCallback, useMemo, useState } from "react";
import type { HTMLAttributes } from "react";
import type { TimelineEvent } from "@harmony/protocol";
import { Virtuoso } from "react-virtuoso";
import { cn } from "../utils";
import { MessageEvent } from "./message_event";
import { SystemEvent } from "./system_event";
import { DateDivider, ReadMarker, TimelineStart } from "./timeline_divider";

const FIRST_ITEM_INDEX = 100_000;
const DEFAULT_ITEM_HEIGHT = 40;
const OVERSCAN_TOP = 1000;
const OVERSCAN_BOTTOM = 400;
const GROUP_INTERVAL_MS = 5 * 60 * 1000;
const AT_BOTTOM_THRESHOLD = 50;

// #region MessageList

interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  events: TimelineEvent[];
  onLoadMore?: () => Promise<boolean>;
}

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

function isGrouped(events: TimelineEvent[], index: number): boolean {
  if (index === 0) return false;
  const prev = events[index - 1];
  const curr = events[index];
  if (prev.content.type !== "message" || curr.content.type !== "message")
    return false;
  if (prev.sender !== curr.sender) return false;
  if (curr.timestamp - prev.timestamp >= GROUP_INTERVAL_MS) return false;
  return true;
}

function parseVirtualKind(kind: string): { type: string; value?: string } {
  if (kind.startsWith("date_divider:")) {
    return { type: "date_divider", value: kind.slice("date_divider:".length) };
  }
  return { type: kind };
}

function isPending(event: TimelineEvent): boolean {
  return event.sendState?.state === "notSentYet";
}

function MessageList({
  events,
  onLoadMore,
  className,
  ...props
}: MessageListProps) {
  const [reachedStart, setReachedStart] = useState(false);
  const [initialCount, setInitialCount] = useState<number | null>(null);

  const filtered = useMemo(
    () => events.filter((event) => event.content.type !== "unknown"),
    [events],
  );

  if (initialCount === null && filtered.length > 0) {
    setInitialCount(filtered.length);
  }

  const firstItemIndex =
    FIRST_ITEM_INDEX - (filtered.length - (initialCount ?? filtered.length));

  const handleStartReached = useCallback(async () => {
    if (reachedStart || !onLoadMore) return;
    const hitStart = await onLoadMore();
    if (hitStart) setReachedStart(true);
  }, [reachedStart, onLoadMore]);

  return (
    <div
      data-scope="message-list"
      data-part="root"
      className={cn("flex-1", className)}
      {...props}
    >
      <Virtuoso
        data={filtered}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={Math.max(0, filtered.length - 1)}
        followOutput="auto"
        alignToBottom
        atBottomThreshold={AT_BOTTOM_THRESHOLD}
        defaultItemHeight={DEFAULT_ITEM_HEIGHT}
        increaseViewportBy={{ top: OVERSCAN_TOP, bottom: OVERSCAN_BOTTOM }}
        startReached={handleStartReached}
        computeItemKey={(index, event) => event.id ?? `pending-${index}`}
        itemContent={(index, event) => {
          const dataIndex = index - firstItemIndex;

          if (event.content.type === "virtual") {
            const virtual = parseVirtualKind(event.content.kind);
            switch (virtual.type) {
              case "date_divider":
                return <DateDivider timestamp={Number(virtual.value)} />;
              case "read_marker":
                return <ReadMarker />;
              case "timeline_start":
                return <TimelineStart />;
              default:
                return null;
            }
          }

          if (event.content.type === "message") {
            return (
              <MessageEvent
                sender={event.senderName ?? event.sender ?? "Unknown"}
                body={event.content.body}
                timestamp={event.timestamp}
                pending={isPending(event)}
                grouped={isGrouped(filtered, dataIndex)}
              />
            );
          }

          const systemText = formatSystemContent(event);
          if (systemText) {
            return <SystemEvent content={systemText} />;
          }

          return null;
        }}
      />
    </div>
  );
}

// #endregion

export { MessageList };
