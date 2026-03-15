import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

// #region Rail

interface RailProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function Rail({ children, className, ...props }: RailProps) {
  return (
    <nav
      data-scope="space-rail"
      data-part="root"
      className={cn(
        "flex flex-col items-center gap-2 py-2 px-1.5 bg-surface-100-900 border-r border-surface-300-700",
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  );
}

// #endregion

// #region Item

interface ItemProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  unread?: boolean;
  mentionCount?: number;
  label: string;
  children: ReactNode;
}

function Item({ active, unread, mentionCount, label, children, className, ...props }: ItemProps) {
  return (
    <button
      data-scope="space-rail"
      data-part="item"
      data-state={active ? "active" : undefined}
      data-unread={unread || undefined}
      aria-label={label}
      className={cn(
        "relative flex items-center justify-center size-10 rounded-xl",
        "bg-surface-300-700 text-surface-600-400 cursor-pointer transition-all",
        "hover:rounded-lg hover:bg-surface-400-600",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
        active && "rounded-lg bg-primary-500 text-on-primary",
        className,
      )}
      {...props}
    >
      <span
        data-scope="space-rail"
        data-part="indicator"
        className={cn(
          "absolute -left-1.5 w-1 rounded-full bg-surface-950-50 transition-all",
          active ? "h-5" : unread ? "h-2" : "h-0",
        )}
      />
      {children}
      {mentionCount != null && mentionCount > 0 && (
        <span
          data-scope="space-rail"
          data-part="mention-badge"
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center font-bold rounded-full text-[12px] badge preset-filled-error-500"
        >
          {mentionCount}
        </span>
      )}
    </button>
  );
}

// #endregion

// #region Separator

function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-scope="space-rail"
      data-part="separator"
      role="separator"
      className={cn("w-6 h-px bg-surface-300-700 my-1", className)}
      {...props}
    />
  );
}

// #endregion

// #region Export

export { Rail, Item, Separator };

Rail.Item = Item;
Rail.Separator = Separator;

// #endregion
