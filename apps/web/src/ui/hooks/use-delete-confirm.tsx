import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDelayedUnmount } from "@/primitives";
import { Button, Dialog } from "@runitbk/react";

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
      <Dialog.Root
        open={open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup ref={contentRef}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={close}>
                {cancelLabel}
              </Button>
              <Button variant="danger" onClick={confirm}>
                {confirmLabel}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );

  return { open, request, dialog };
}

export { useDeleteConfirm };
