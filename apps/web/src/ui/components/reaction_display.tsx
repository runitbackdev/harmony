import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactionGroup } from "@harmony/harmony-bindings-web";
import { Transition } from "@/primitives";

interface ReactionDisplayProps {
  reactions: ReactionGroup[];
  currentUserId?: string;
  onToggleReaction?: (key: string) => void;
}

type RenderItem = ReactionGroup & { present: boolean; fresh?: boolean };

function ReactionDisplay({ reactions, currentUserId, onToggleReaction }: ReactionDisplayProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [renderList, setRenderList] = useState<RenderItem[]>(() =>
    reactions.map((r) => ({ ...r, present: true })),
  );

  useEffect(() => {
    setRenderList((prev) => {
      const incomingByKey = new Map(reactions.map((r) => [r.key, r]));
      const next: RenderItem[] = [];

      // Update existing items, mark as exiting if missing from incoming
      for (const item of prev) {
        const incoming = incomingByKey.get(item.key);
        if (incoming) {
          next.push({ ...incoming, present: true, fresh: item.fresh });
        } else {
          next.push({ ...item, present: false });
        }
      }

      // Add brand-new items not in prev
      const prevKeys = new Set(prev.map((p) => p.key));
      for (const r of reactions) {
        if (!prevKeys.has(r.key)) {
          next.push({ ...r, present: true, fresh: true });
        }
      }

      return next;
    });
  }, [reactions]);

  const handleExited = useCallback((key: string) => {
    setRenderList((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const presentCount = renderList.filter((r) => r.present).length;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!presentCount) return;

      let next = focusIndex;
      switch (e.key) {
        case "ArrowRight":
          next = (focusIndex + 1) % presentCount;
          break;
        case "ArrowLeft":
          next = (focusIndex - 1 + presentCount) % presentCount;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = presentCount - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setFocusIndex(next);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-status="open"]',
      );
      buttons?.[next]?.focus();
    },
    [focusIndex, presentCount],
  );

  let presentIndex = -1;
  return (
    <Transition open={renderList.length > 0}>
      <div
        ref={groupRef}
        role="group"
        aria-label="Reactions"
        data-scope="reaction"
        data-part="root"
        className="flex flex-wrap gap-1 mt-1"
        onKeyDown={onKeyDown}
      >
        {renderList.map((reaction) => {
          if (reaction.present) presentIndex++;
          const indexForFocus = reaction.present ? presentIndex : -1;
          const active = currentUserId ? reaction.senders.includes(currentUserId) : false;
          return (
            <Transition
              key={reaction.key}
              open={reaction.present}
              onExited={() => handleExited(reaction.key)}
            >
              <button
                type="button"
                aria-pressed={active}
                aria-label={`${reaction.key}, ${reaction.count} reaction${reaction.count !== 1 ? "s" : ""}${active ? ", you reacted" : ""}`}
                data-scope="reaction"
                data-part="pill"
                data-active={active || undefined}
                data-pending={reaction.pending || undefined}
                data-fresh={reaction.fresh || undefined}
                tabIndex={indexForFocus === focusIndex ? 0 : -1}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-data cursor-pointer transition-colors border-line hover:bg-soft data-active:border-accent data-active:bg-accent/10 data-pending:opacity-50"
                onClick={() => onToggleReaction?.(reaction.key)}
              >
                <span data-scope="reaction" data-part="emoji">
                  {reaction.key}
                </span>
                <span
                  data-scope="reaction"
                  data-part="count"
                  className={active ? "text-ink" : "text-sub"}
                >
                  {reaction.count}
                </span>
              </button>
            </Transition>
          );
        })}
      </div>
    </Transition>
  );
}

export { ReactionDisplay };
