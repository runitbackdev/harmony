import type { LucideIcon } from "lucide-react";
import { Copy, Pencil, Reply, Trash2 } from "lucide-react";
import { useDeleteConfirm } from "../hooks/use-delete-confirm";
import { ContextMenu, type VirtualAnchor } from "./context_menu";

// #region Types

interface MessageMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "danger";
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface MessageContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualAnchor: VirtualAnchor | null;
  isOwn: boolean;
  /** Plaintext body, used by the default copy handler. */
  body: string;
  onReply?: () => void;
  /** Override the default clipboard copy. */
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Additional items appended after built-ins. Lets callers inject custom actions. */
  extras?: readonly MessageMenuItem[];
}

// #endregion

// #region Component

function MessageContextMenu({
  open,
  onOpenChange,
  virtualAnchor,
  isOwn,
  body,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  extras,
}: MessageContextMenuProps) {
  const deleteConfirm = useDeleteConfirm({
    onConfirm: () => onDelete?.(),
    onClose: () => onOpenChange(false),
  });

  const copy = () => {
    if (onCopy) return onCopy();
    void navigator.clipboard.writeText(body);
  };

  return (
    <>
      {!deleteConfirm.open && (
        <ContextMenu
          open={open}
          onOpenChange={onOpenChange}
          virtualAnchor={virtualAnchor}
          title="Message actions"
        >
          {onReply && (
            <ContextMenu.Item icon={Reply} onSelect={onReply}>
              Reply
            </ContextMenu.Item>
          )}
          <ContextMenu.Item icon={Copy} onSelect={copy}>
            Copy text
          </ContextMenu.Item>
          {isOwn && onEdit && (
            <ContextMenu.Item icon={Pencil} onSelect={onEdit}>
              Edit
            </ContextMenu.Item>
          )}
          {isOwn && onDelete && (
            <>
              <ContextMenu.Separator />
              <ContextMenu.Item icon={Trash2} variant="danger" onSelect={deleteConfirm.request}>
                Delete
              </ContextMenu.Item>
            </>
          )}
          {extras && extras.length > 0 && (
            <>
              <ContextMenu.Separator />
              {extras.map((item) => (
                <ContextMenu.Item
                  key={item.id}
                  icon={item.icon}
                  variant={item.variant}
                  shortcut={item.shortcut}
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                >
                  {item.label}
                </ContextMenu.Item>
              ))}
            </>
          )}
        </ContextMenu>
      )}
      {deleteConfirm.dialog}
    </>
  );
}

// #endregion

export { MessageContextMenu };
export type { MessageContextMenuProps, MessageMenuItem };
