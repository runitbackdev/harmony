import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  FloatingFocusManager,
  FloatingList,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
  useRole,
  useTypeahead,
} from "@floating-ui/react";
import { Drawer } from "vaul";
import type { LucideIcon } from "lucide-react";
import { Transition, useDelayedUnmount, useMediaQuery } from "@/primitives";
import { cn } from "../utils";

// #region Context

interface ContextMenuShellContext {
  isMobile: boolean;
  activeIndex: number | null;
  getItemProps: (props?: HTMLAttributes<HTMLElement>) => Record<string, unknown>;
  onOpenChange: (open: boolean) => void;
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
  const elementsRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);

  return (
    <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
      {isDesktop ? (
        <DesktopMenu
          open={open}
          onOpenChange={onOpenChange}
          virtualAnchor={virtualAnchor}
          elementsRef={elementsRef}
          labelsRef={labelsRef}
        >
          {children}
        </DesktopMenu>
      ) : (
        <MobileSheet open={open} onOpenChange={onOpenChange} title={title}>
          {children}
        </MobileSheet>
      )}
    </FloatingList>
  );
}

// #endregion

// #region Desktop

interface DesktopMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualAnchor: VirtualAnchor | null;
  elementsRef: React.RefObject<Array<HTMLElement | null>>;
  labelsRef: React.RefObject<Array<string | null>>;
  children: ReactNode;
}

function DesktopMenu({
  open,
  onOpenChange,
  virtualAnchor,
  elementsRef,
  labelsRef,
  children,
}: DesktopMenuProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: "right-start",
    transform: false,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!virtualAnchor) return;
    const { x, y } = virtualAnchor;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x,
        y,
        top: y,
        left: x,
        bottom: y,
        right: x,
        width: 0,
        height: 0,
      }),
    });
  }, [refs, virtualAnchor]);

  const listNav = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: setActiveIndex,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });

  const { getFloatingProps, getItemProps } = useInteractions([listNav, typeahead, dismiss, role]);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const status = useDelayedUnmount(open, contentRef);

  const shellValue = useMemo<ContextMenuShellContext>(
    () => ({
      isMobile: false,
      activeIndex,
      getItemProps: (props) => getItemProps(props),
      onOpenChange,
    }),
    [activeIndex, getItemProps, onOpenChange],
  );

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
      contentRef.current = node;
    },
    [refs],
  );

  if (status === "unmounted") return null;

  return (
    <ContextMenuShellContext.Provider value={shellValue}>
      <FloatingPortal>
        <FloatingFocusManager context={context} initialFocus={-1} returnFocus modal={false}>
          <Transition open={open}>
            <div
              ref={setRefs}
              data-scope="context-menu"
              data-part="root"
              style={floatingStyles}
              className={cn(
                "z-50 min-w-44 rounded-md border border-surface-300-700 bg-surface-50-950 p-1 shadow-lg",
                "focus-visible:outline-none",
              )}
              {...getFloatingProps()}
            >
              {children}
            </div>
          </Transition>
        </FloatingFocusManager>
      </FloatingPortal>
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
    () => ({
      isMobile: true,
      activeIndex: null,
      getItemProps: () => ({}),
      onOpenChange,
    }),
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
              "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-surface-300-700",
              "bg-surface-50-950 pb-[env(safe-area-inset-bottom)] shadow-xl",
              "focus-visible:outline-none",
            )}
          >
            <Drawer.Handle
              data-scope="context-menu"
              data-part="handle"
              className="mx-auto my-3 h-1 w-10 shrink-0 rounded-full bg-surface-300-700"
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

function Item({
  icon: Icon,
  variant = "default",
  disabled,
  shortcut,
  onSelect,
  children,
}: ItemProps) {
  const { isMobile, activeIndex, getItemProps, onOpenChange } = useShell();
  const label = typeof children === "string" ? children : undefined;
  const { ref, index } = useListItem({ label });
  const isActive = !isMobile && activeIndex === index;

  const handle = () => {
    if (disabled) return;
    onSelect();
    onOpenChange(false);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={isMobile ? 0 : isActive ? 0 : -1}
      disabled={disabled}
      data-scope="context-menu"
      data-part="item"
      data-variant={variant}
      data-active={isActive || undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isMobile ? "px-3 py-3 text-base" : "px-2 py-1.5 text-sm",
        variant === "danger"
          ? "text-error-500 hover:bg-error-500 hover:text-white data-active:bg-error-500 data-active:text-white"
          : "text-surface-800-200 hover:bg-surface-200-800 data-active:bg-surface-200-800",
      )}
      {...getItemProps({
        onClick: handle,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handle();
          }
        },
      })}
    >
      {Icon && <Icon size={isMobile ? 18 : 14} className="shrink-0" />}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && !isMobile && (
        <span className="ml-2 text-xs text-surface-500" aria-hidden>
          {shortcut}
        </span>
      )}
    </button>
  );
}

// #endregion

// #region Separator

function Separator() {
  const { isMobile } = useShell();
  return (
    <div
      role="separator"
      data-scope="context-menu"
      data-part="separator"
      className={cn("my-1 h-px bg-surface-300-700", isMobile ? "mx-2" : "mx-1")}
    />
  );
}

// #endregion

// #region Export

ContextMenu.Item = Item;
ContextMenu.Separator = Separator;

export { ContextMenu };
export type { ContextMenuProps, VirtualAnchor };

// #endregion
