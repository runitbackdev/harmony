import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Menu } from "@runitbk/react";
import { Drawer } from "vaul";
import type { LucideIcon } from "lucide-react";
import { useMediaQuery } from "@/primitives";
import { cn } from "../utils";

// #region Context

interface ContextMenuShellContext {
  isMobile: boolean;
  close: () => void;
}

const ContextMenuShellContext = createContext<ContextMenuShellContext | null>(null);

function useShell() {
  const ctx = useContext(ContextMenuShellContext);
  if (!ctx) throw new Error("ContextMenu.Item must be rendered inside ContextMenu");
  return ctx;
}

// #endregion

// #region Root

interface VirtualAnchor {
  x: number;
  y: number;
}

interface ContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cursor coordinates for desktop floating menu. Ignored on mobile. */
  virtualAnchor: VirtualAnchor | null;
  /** Required for screen-reader announcement on mobile drawer. */
  title: string;
  children: ReactNode;
}

function ContextMenu({ open, onOpenChange, virtualAnchor, title, children }: ContextMenuProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return isDesktop ? (
    <DesktopMenu open={open} onOpenChange={onOpenChange} virtualAnchor={virtualAnchor}>
      {children}
    </DesktopMenu>
  ) : (
    <MobileSheet open={open} onOpenChange={onOpenChange} title={title}>
      {children}
    </MobileSheet>
  );
}

// #endregion

// #region Desktop

interface DesktopMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualAnchor: VirtualAnchor | null;
  children: ReactNode;
}

function DesktopMenu({ open, onOpenChange, virtualAnchor, children }: DesktopMenuProps) {
  const x = virtualAnchor?.x;
  const y = virtualAnchor?.y;

  const anchor = useMemo(
    () =>
      x === undefined || y === undefined
        ? undefined
        : { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) },
    [x, y],
  );

  const shellValue = useMemo<ContextMenuShellContext>(
    () => ({ isMobile: false, close: () => onOpenChange(false) }),
    [onOpenChange],
  );

  return (
    <ContextMenuShellContext.Provider value={shellValue}>
      <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <Menu.Portal>
          <Menu.Positioner
            anchor={anchor}
            side="right"
            align="start"
            sideOffset={4}
            collisionPadding={8}
          >
            <Menu.Popup data-scope="context-menu" data-part="root">
              {children}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </ContextMenuShellContext.Provider>
  );
}

// #endregion

// #region Mobile

interface MobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

function MobileSheet({ open, onOpenChange, title, children }: MobileSheetProps) {
  const shellValue = useMemo<ContextMenuShellContext>(
    () => ({ isMobile: true, close: () => onOpenChange(false) }),
    [onOpenChange],
  );

  return (
    <ContextMenuShellContext.Provider value={shellValue}>
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay
            data-scope="context-menu"
            data-part="overlay"
            className="fixed inset-0 z-50 bg-black/60"
          />
          <Drawer.Content
            data-scope="context-menu"
            data-part="root"
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-line",
              "bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl",
              "focus-visible:outline-none",
            )}
          >
            <Drawer.Handle
              data-scope="context-menu"
              data-part="handle"
              className="mx-auto my-3 h-1 w-10 shrink-0 rounded-full bg-soft"
            />
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <div
              role="menu"
              data-scope="context-menu"
              data-part="list"
              className="flex flex-col px-2 pb-2"
            >
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </ContextMenuShellContext.Provider>
  );
}

// #endregion

// #region Item

interface ItemProps {
  icon?: LucideIcon;
  variant?: "default" | "danger";
  disabled?: boolean;
  shortcut?: string;
  onSelect: () => void;
  children: ReactNode;
}

const DANGER_CLASSES =
  "text-danger data-highlighted:bg-danger data-highlighted:text-danger-ink data-highlighted:ring-danger";

function Item({
  icon: Icon,
  variant = "default",
  disabled,
  shortcut,
  onSelect,
  children,
}: ItemProps) {
  const { isMobile, close } = useShell();
  const label = typeof children === "string" ? children : undefined;

  if (isMobile) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        data-scope="context-menu"
        data-part="item"
        data-variant={variant}
        className={cn(
          "flex w-full items-center gap-2 rounded px-3 py-3 text-left text-body transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variant === "danger"
            ? "text-danger hover:bg-danger hover:text-danger-ink"
            : "text-ink hover:bg-soft",
        )}
        onClick={() => {
          if (disabled) return;
          onSelect();
          close();
        }}
      >
        {Icon && <Icon size={18} className="shrink-0" />}
        <span className="flex-1 truncate">{children}</span>
      </button>
    );
  }

  return (
    <Menu.Item
      label={label}
      disabled={disabled}
      data-scope="context-menu"
      data-part="item"
      data-variant={variant}
      className={variant === "danger" ? DANGER_CLASSES : undefined}
      onClick={onSelect}
    >
      {Icon && <Icon size={14} className="shrink-0" />}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && (
        <span className="ml-2 text-data text-sub" aria-hidden>
          {shortcut}
        </span>
      )}
    </Menu.Item>
  );
}

// #endregion

// #region Separator

function Separator() {
  const { isMobile } = useShell();
  if (isMobile) {
    return (
      <div
        role="separator"
        data-scope="context-menu"
        data-part="separator"
        className="mx-2 my-1 h-px bg-soft"
      />
    );
  }
  return <Menu.Separator data-scope="context-menu" data-part="separator" />;
}

// #endregion

// #region Export

ContextMenu.Item = Item;
ContextMenu.Separator = Separator;

export { ContextMenu };
export type { ContextMenuProps, VirtualAnchor };

// #endregion
