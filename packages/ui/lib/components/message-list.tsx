import { useMemo } from "react";
import type { HTMLAttributes } from "react";
import type { TimelineEvent } from "@harmony/protocol";
import { Virtuoso } from "react-virtuoso";
import { cn } from "../utils";
import { MessageEvent } from "./message-event";
import { SystemEvent } from "./system-event";

// #region MessageList

interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  events: TimelineEvent[];
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
  return prev.sender === curr.sender;
}

function isPending(event: TimelineEvent): boolean {
  return event.sendState?.state === "notSentYet";
}

function MessageList({ events, className, ...props }: MessageListProps) {
  const filtered = useMemo(
    () => events.filter((e) => e.content.type !== "virtual"),
    [events],
  );

  return (
    <div
      data-scope="message-list"
      data-part="root"
      className={cn("flex-1", className)}
      {...props}
    >
      <Virtuoso
        data={filtered}
        initialTopMostItemIndex={Math.max(0, filtered.length - 1)}
        followOutput="smooth"
        alignToBottom
        itemContent={(index, event) => {
          if (event.content.type === "message") {
            return (
              <MessageEvent
                sender={event.senderName ?? event.sender ?? "Unknown"}
                body={event.content.body}
                timestamp={event.timestamp}
                pending={isPending(event)}
                grouped={isGrouped(filtered, index)}
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
