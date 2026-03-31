import { useCallback, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import {
  editMessage,
  getMembers,
  paginateTimeline,
  sendMessage,
  subscribeTimeline,
  toggleReaction,
  useReactions,
  useRooms,
  useTimeline,
  getSession,
} from "@harmony/react";
import { MessageList, ReactionDisplay } from "@harmony/ui";
import { Composer, EditComposer } from "@harmony/composer";
import type { EditTarget } from "@harmony/composer";
import { Hash } from "lucide-react";
import type { TimelineContent, TimelineEvent } from "@harmony/protocol";

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

function ConnectedReactions({ eventId }: { eventId: string }) {
  const { roomId } = useParams({ from: "/_authenticated/_chat/$spaceId/$roomId" });
  const reactions = useReactions(eventId);
  if (!reactions?.length) return null;
  return (
    <ReactionDisplay
      reactions={reactions}
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

function TimelineView() {
  const { roomId } = useParams({
    from: "/_authenticated/_chat/$spaceId/$roomId",
  });
  const events = useTimeline();
  const [debug, setDebug] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const currentUserId = getSession()?.userId;
  const handleLoadMore = useCallback(() => paginateTimeline(roomId), [roomId]);

  const handleToggleReaction = useCallback(
    (eventId: string, key: string) => {
      void toggleReaction(roomId, { eventId }, key);
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
        target={{ eventId: event.id ?? undefined, transactionId: event.transactionId ?? undefined }}
        content={event.content.formattedBody ?? event.content.body}
        onEdit={handleEdit}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-surface-200-800 px-4 py-2">
        <RoomHeader roomId={roomId} />
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setDebug((d) => !d)}
            className="ml-auto text-xs text-surface-500 transition-colors hover:text-surface-950-50"
          >
            {debug ? "pretty" : "debug"}
          </button>
        )}
      </header>

      {debug ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
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
      ) : (
        <MessageList
          events={events}
          onLoadMore={handleLoadMore}
          onEditMessage={handleEditMessage}
          editingEventId={editingId}
          renderEditor={renderEditor}
          currentUserId={currentUserId}
          onToggleReaction={handleToggleReaction}
          ReactionSlot={ConnectedReactions}
        />
      )}

      <div className="border-t border-surface-200-800 p-4">
        <Composer
          roomId={roomId}
          getMembers={getMembers}
          onSend={(body, html) => void sendMessage(roomId, body, html)}
        />
      </div>
    </div>
  );
}
