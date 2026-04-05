import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";
import { EmojiPickerButton } from "@harmony/composer";
import { Pencil, Trash2 } from "lucide-react";

const QUICK_REACTIONS = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F525}", "\u{1F440}"];

interface MessageActionBarProps {
  isOwn?: boolean;
  onToggleReaction?: (key: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  anchor: HTMLElement;
  onDismiss?: () => void;
}

function MessageActionBar({
  isOwn,
  onToggleReaction,
  onEdit,
  onDelete,
  anchor,
  onDismiss,
}: MessageActionBarProps) {
  const { floatingStyles, refs } = useFloating({
    placement: "top-end",
    middleware: [offset(-16), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(anchor);
  }, [refs, anchor]);

  return createPortal(
    <div
      ref={refs.setFloating}
      data-scope="message-action-bar"
      data-part="root"
      style={floatingStyles}
      className="z-50 flex items-center gap-0.5 rounded-md border border-surface-300-700 bg-surface-50-950 px-1 py-0.5 shadow-sm"
      onPointerLeave={(e) => {
        if ("emojiPickerOpen" in document.documentElement.dataset) return;
        const related = e.relatedTarget;
        if (related instanceof Node && anchor.contains(related)) return;
        onDismiss?.();
      }}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React with ${emoji}`}
          tabIndex={-1}
          data-scope="message-action-bar"
          data-part="action"
          className="rounded p-1 text-sm hover:bg-surface-200-800 transition-colors"
          onClick={() => onToggleReaction?.(emoji)}
        >
          {emoji}
        </button>
      ))}

      <EmojiPickerButton
        placement="left-start"
        onSelect={(emoji) => {
          if (emoji.native) onToggleReaction?.(emoji.native);
          requestAnimationFrame(() => {
            if (!document.querySelector('[data-scope="emoji-picker"][data-part="popover"]')) {
              onDismiss?.();
            }
          });
        }}
      />

      {isOwn && onEdit && (
        <button
          type="button"
          aria-label="Edit message"
          tabIndex={-1}
          data-scope="message-action-bar"
          data-part="action"
          className="rounded p-1 text-surface-500 hover:bg-surface-200-800 hover:text-surface-950-50 transition-colors"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
      )}

      {isOwn && onDelete && (
        <button
          type="button"
          aria-label="Delete message"
          tabIndex={-1}
          data-scope="message-action-bar"
          data-part="action"
          className="rounded p-1 text-surface-500 hover:bg-error-500 hover:text-white transition-colors"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>,
    document.body,
  );
}

export { MessageActionBar };
