import { useRef, useState, useCallback } from "react";
import type { ReactionGroup } from "@harmony/protocol";

interface ReactionDisplayProps {
  reactions: ReactionGroup[];
  currentUserId?: string;
  onToggleReaction?: (key: string) => void;
}

function ReactionDisplay({ reactions, currentUserId, onToggleReaction }: ReactionDisplayProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = reactions.length;
      if (!count) return;

      let next = focusIndex;
      switch (e.key) {
        case "ArrowRight":
          next = (focusIndex + 1) % count;
          break;
        case "ArrowLeft":
          next = (focusIndex - 1 + count) % count;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = count - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setFocusIndex(next);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[next]?.focus();
    },
    [focusIndex, reactions.length],
  );

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label="Reactions"
      data-scope="reaction"
      data-part="root"
      className="flex flex-wrap gap-1 mt-1"
      onKeyDown={onKeyDown}
    >
      {reactions.map((reaction, i) => {
        const active = currentUserId ? reaction.senders.includes(currentUserId) : false;
        return (
          <button
            key={reaction.key}
            type="button"
            aria-pressed={active}
            aria-label={`${reaction.key}, ${reaction.count} reaction${reaction.count !== 1 ? "s" : ""}${active ? ", you reacted" : ""}`}
            data-scope="reaction"
            data-part="pill"
            data-active={active || undefined}
            data-pending={reaction.pending || undefined}
            tabIndex={i === focusIndex ? 0 : -1}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs cursor-pointer transition-colors border-surface-300-700 hover:bg-surface-200-800 data-active:border-primary-500 data-active:bg-primary-500/10 data-pending:opacity-50"
            onClick={() => onToggleReaction?.(reaction.key)}
          >
            <span data-scope="reaction" data-part="emoji">
              {reaction.key}
            </span>
            <span
              data-scope="reaction"
              data-part="count"
              className={active ? "text-surface-950-50" : "text-surface-500"}
            >
              {reaction.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { ReactionDisplay };
