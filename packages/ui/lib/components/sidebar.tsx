import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

// #region Sidebar

interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function Sidebar({ children, className, ...props }: SidebarProps) {
  return (
    <aside
      data-scope="sidebar"
      data-part="root"
      className={cn(
        "flex flex-col w-60 bg-surface-200-800 border-r border-surface-300-700 h-full",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

// #endregion

// #region Header

interface HeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Header({ children, className, ...props }: HeaderProps) {
  return (
    <div
      data-scope="sidebar"
      data-part="header"
      className={cn("p-3 border-b border-surface-300-700", className)}
      {...props}
    >
      <div
        data-scope="sidebar"
        data-part="header-title"
        className="text-base font-semibold text-surface-950-50"
      >
        {children}
      </div>
    </div>
  );
}

// #endregion

// #region Section Label

interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function SectionLabel({ children, className, ...props }: SectionLabelProps) {
  return (
    <div
      data-scope="sidebar"
      data-part="section-label"
      className={cn(
        "px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// #endregion

// #region List

interface ListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function List({ children, className, ...props }: ListProps) {
  return (
    <div
      data-scope="sidebar"
      data-part="list"
      role="list"
      className={cn("flex flex-col gap-px p-1 px-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// #endregion

// #region Item

interface ItemProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  unread?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}

function Item({
  active,
  unread,
  icon,
  badge,
  children,
  className,
  ...props
}: ItemProps) {
  return (
    <button
      data-scope="sidebar"
      data-part="item"
      data-state={active ? "active" : undefined}
      data-unread={unread || undefined}
      role="listitem"
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-container text-sm",
        "text-surface-600-400 cursor-pointer transition-colors",
        "hover:bg-surface-300-700",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
        active && "bg-surface-200-800 text-surface-950-50",
        unread && "text-surface-950-50 font-medium",
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          data-scope="sidebar"
          data-part="item-icon"
          className="text-surface-500"
        >
          {icon}
        </span>
      )}
      <span data-scope="sidebar" data-part="item-label" className="truncate">
        {children}
      </span>
      {badge}
    </button>
  );
}

// #endregion

// #region Badge

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  count: number;
  mention?: boolean;
}

function Badge({ count, mention, className, ...props }: BadgeProps) {
  return (
    <span
      data-scope="sidebar"
      data-part="badge"
      data-mention={mention || undefined}
      className={cn(
        "badge-icon ml-auto",
        mention ? "preset-filled-primary-500" : "preset-filled-surface-300-700",
        className,
      )}
      {...props}
    >
      {count}
    </span>
  );
}

// #endregion

// #region Export

Sidebar.Header = Header;
Sidebar.SectionLabel = SectionLabel;
Sidebar.List = List;
Sidebar.Item = Item;
Sidebar.Badge = Badge;

export { Sidebar };

// #endregion
