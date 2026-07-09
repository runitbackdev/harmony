import { memo } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

// #region Sidebar

interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function Sidebar({ children, className, ...props }: SidebarProps) {
  return (
    <aside
      data-scope="sidebar"
      data-part="root"
      className={cn("flex flex-col w-60 bg-soft border-r border-line h-full", className)}
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
      className={cn("p-3 border-b border-line", className)}
      {...props}
    >
      <div
        data-scope="sidebar"
        data-part="header-title"
        className="text-body font-semibold text-ink"
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
        "px-3 pt-2 pb-1 text-data font-semibold uppercase tracking-wide text-sub",
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

interface ListProps extends HTMLAttributes<HTMLUListElement> {
  children: ReactNode;
}

function List({ children, className, ...props }: ListProps) {
  return (
    <ul
      data-scope="sidebar"
      data-part="list"
      className={cn("flex flex-col gap-px p-1 px-2 list-none", className)}
      {...props}
    >
      {children}
    </ul>
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

const Item = memo(function Item({
  active,
  unread,
  icon,
  badge,
  children,
  className,
  ...props
}: ItemProps) {
  return (
    <li data-scope="sidebar" data-part="item-wrapper">
      <button
        data-scope="sidebar"
        data-part="item"
        data-state={active ? "active" : undefined}
        data-unread={unread || undefined}
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1.5 rounded-lg text-small",
          "text-sub cursor-pointer transition-colors",
          "hover:bg-soft",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          active && "bg-soft text-ink",
          unread && "text-ink font-medium",
          className,
        )}
        {...props}
      >
        {icon && (
          <span data-scope="sidebar" data-part="item-icon" className="text-sub">
            {icon}
          </span>
        )}
        <span data-scope="sidebar" data-part="item-label" className="truncate">
          {children}
        </span>
        {badge}
      </button>
    </li>
  );
});

// #endregion

// #region Dot

interface DotProps extends HTMLAttributes<HTMLSpanElement> {
  mention?: boolean;
}

function Dot({ mention, className, ...props }: DotProps) {
  return (
    <span
      data-scope="sidebar"
      data-part="dot"
      data-mention={mention || undefined}
      aria-label={mention ? "Mention" : "Unread"}
      className={cn("relative ml-auto flex size-2", className)}
      {...props}
    >
      {mention && (
        <span
          aria-hidden
          className="absolute inline-flex size-full rounded-full bg-accent opacity-75 motion-safe:animate-ping"
        />
      )}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex size-2 rounded-full bg-accent",
          !mention && "opacity-60",
        )}
      />
    </span>
  );
}

// #endregion

// #region Export

Sidebar.Header = Header;
Sidebar.SectionLabel = SectionLabel;
Sidebar.List = List;
Sidebar.Item = Item;
Sidebar.Dot = Dot;

export { Sidebar };

// #endregion
