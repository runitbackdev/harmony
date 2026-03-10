import { useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { sendMessage, subscribeTimeline, useTimeline } from "@harmony/react";
import { MessageList } from "@harmony/ui";
import type { SendState, TimelineContent } from "@harmony/protocol";

export const Route = createFileRoute("/_authenticated/_chat/$spaceId/$roomId")({
  loader: async ({ params }) => {
    await subscribeTimeline(params.roomId);
  },
  component: TimelineView,
});

// #region Debug

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

function isPending(sendState: SendState | null): boolean {
  return sendState?.state === "notSentYet";
}

// #endregion

function TimelineView() {
  const { roomId } = useParams({
    from: "/_authenticated/_chat/$spaceId/$roomId",
  });
  const events = useTimeline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [debug, setDebug] = useState(false);

  function handleSubmit() {
    const input = inputRef.current;
    if (!input) return;

    const body = input.value.trim();
    if (!body) return;

    input.value = "";
    sendMessage(roomId, body);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-end px-4 pt-2">
        <button
          type="button"
          onClick={() => setDebug((d) => !d)}
          className="text-xs text-surface-500 transition-colors hover:text-surface-950-50"
        >
          {debug ? "pretty" : "debug"}
        </button>
      </div>

      {debug ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <ul className="space-y-1 font-mono text-sm text-surface-950-50">
            {events.map((event, i) => (
              <li
                key={event.id ?? i}
                className={
                  isPending(event.sendState)
                    ? "opacity-50 transition-opacity duration-300"
                    : "transition-opacity duration-300"
                }
              >
                <span className="text-surface-500">
                  {event.senderName ?? event.sender}
                </span>{" "}
                {formatContent(event.content)}
                {event.sendState && (
                  <span className="text-surface-400">
                    {" "}
                    [{event.sendState.state}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MessageList events={events} className="px-4 pb-4" />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="border-t border-surface-200-800 p-4"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Send a message..."
          className="w-full rounded bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50 placeholder:text-surface-500 focus:outline-none"
        />
      </form>
    </div>
  );
}
