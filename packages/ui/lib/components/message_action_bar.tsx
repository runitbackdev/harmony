import { useEffect, useRef, useState } from "react";
import { useFloating, FloatingPortal, offset, flip, shift, autoUpdate } from "@floating-ui/react";
import { EmojiPickerButton } from "@harmony/composer";
import { Pencil, Trash2 } from "lucide-react";
import { Transition, useDelayedUnmount } from "@harmony/primitives";
import { Dialog } from "./dialog";

const QUICK_REACTIONS = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F525}", "\u{1F440}"];

interface MessageActionBarProps {
  isOwn?: boolean;
  onToggleReaction?: (key: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  anchor: HTMLElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MessageActionBar({
  isOwn,
  onToggleReaction,
  onEdit,
  onDelete,
  anchor,
  open,
  onOpenChange,
}: MessageActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const dialogStatus = useDelayedUnmount(confirmDelete, dialogContentRef);

  const { floatingStyles, refs } = useFloating({
    open,
    onOpenChange,
    placement: "top-end",
    transform: false,
    middleware: [offset(-16), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(anchor);
  }, [refs, anchor]);

  const bar = (
    <FloatingPortal>
      <Transition open={open}>
        <div
          ref={refs.setFloating}
          data-scope="message-action-bar"
          data-part="root"
          style={floatingStyles}
          className="z-50 flex items-center gap-0.5 rounded-md border border-surface-300-700 bg-surface-50-950 px-1 py-0.5 shadow-sm"
          onPointerLeave={(e) => {
            if (confirmDelete) return;
            if ("emojiPickerOpen" in document.documentElement.dataset) return;
            const related = e.relatedTarget;
            if (related instanceof Node && anchor.contains(related)) return;
            onOpenChange(false);
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
            onSelect={(emoji, { keepOpen }) => {
              if (emoji.native) onToggleReaction?.(emoji.native);
              if (!keepOpen) onOpenChange(false);
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
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </Transition>
    </FloatingPortal>
  );

  return (
    <>
      {!confirmDelete && bar}
      {dialogStatus !== "unmounted" && (
        <Dialog
          open={confirmDelete}
          onOpenChange={(details) => {
            if (!details.open) {
              setConfirmDelete(false);
              onOpenChange(false);
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content ref={dialogContentRef}>
                <Dialog.Title>Delete message</Dialog.Title>
                <Dialog.Description>
                  Are you sure you want to delete this message? This can't be undone.
                </Dialog.Description>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-surface-600-400 hover:bg-surface-200-800 transition-colors"
                    onClick={() => {
                      setConfirmDelete(false);
                      onOpenChange(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-error-500 px-4 py-2 text-sm font-medium text-white hover:bg-error-600 transition-colors"
                    onClick={() => {
                      onDelete?.();
                      setConfirmDelete(false);
                      onOpenChange(false);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Positioner>
          </Dialog.Portal>
        </Dialog>
      )}
    </>
  );
}

export { MessageActionBar };
