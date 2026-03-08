import { createFileRoute } from "@tanstack/react-router";
import { subscribeTimeline, useTimeline } from "@harmony/react";
import type { TimelineContent } from "@harmony/protocol";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId/$roomId")({
  loader: async ({ params }) => {
    await subscribeTimeline(params.roomId);
  },
  component: TimelineView,
});

function formatContent(content: TimelineContent): string {
  switch (content.type) {
    case "message":
      return `message - ${content.body}`;
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

function TimelineView() {
  const events = useTimeline();

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <ul className="space-y-1 font-mono text-sm text-surface-950-50">
        {events
          .filter((e) => e.content.type !== "virtual")
          .map((event, i) => (
            <li key={event.id ?? i}>
              <span className="text-surface-500">
                {event.senderName ?? event.sender}
              </span>{" "}
              {formatContent(event.content)}
            </li>
          ))}
      </ul>
    </div>
  );
}
