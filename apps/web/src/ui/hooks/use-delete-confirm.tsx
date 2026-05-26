import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDelayedUnmount } from "@/primitives";
import { Dialog } from "../components/dialog";

interface UseDeleteConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Fired after both confirm and cancel paths close the dialog. */
  onClose?: () => void;
}

interface UseDeleteConfirm {
  /** Whether the confirm dialog is currently open. */
  open: boolean;
  /** Open the confirm dialog. */
  request: () => void;
  /** JSX node to render. Mounts only while animating in/out or open. */
  dialog: ReactNode;
}

function useDeleteConfirm({
  title = "Delete message",
  description = "Are you sure you want to delete this message? This can't be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: UseDeleteConfirmOptions): UseDeleteConfirm {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const status = useDelayedUnmount(open, contentRef);

  const request = useCallback(() => setOpen(true), []);

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const confirm = useCallback(() => {
    onConfirm();
    setOpen(false);
    onClose?.();
  }, [onConfirm, onClose]);

  const dialog =
    status === "unmounted" ? null : (
      <Dialog
        open={open}
        onOpenChange={(details) => {
          if (!details.open) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content ref={contentRef}>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-surface-600-400 hover:bg-surface-200-800 transition-colors"
                  onClick={close}
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-error-500 px-4 py-2 text-sm font-medium text-white hover:bg-error-600 transition-colors"
                  onClick={confirm}
                >
                  {confirmLabel}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog>
    );

  return { open, request, dialog };
}

export { useDeleteConfirm };
