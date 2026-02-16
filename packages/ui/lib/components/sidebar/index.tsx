import type { HTMLAttributes, ReactNode } from "react";
import "./styles.css";

// #region Root

interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function Root({ children, ...props }: SidebarProps) {
  return (
    <aside data-component="sidebar" {...props}>
      {children}
    </aside>
  );
}

// #endregion

// #region Header

interface HeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Header({ children, ...props }: HeaderProps) {
  return (
    <div data-part="header" {...props}>
      <div data-part="header-title">{children}</div>
    </div>
  );
}

// #endregion

// #region Section Label

interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function SectionLabel({ children, ...props }: SectionLabelProps) {
  return (
    <div data-part="section-label" {...props}>
      {children}
    </div>
  );
}

// #endregion

// #region List

interface ListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function List({ children, ...props }: ListProps) {
  return (
    <div data-part="list" {...props}>
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

function Item({ active, unread, icon, badge, children, ...props }: ItemProps) {
  return (
    <button
      data-part="item"
      data-active={active || undefined}
      data-unread={unread || undefined}
      {...props}
    >
      {icon && <span data-part="item-prefix">{icon}</span>}
      {children}
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

function Badge({ count, mention, ...props }: BadgeProps) {
  return (
    <span data-part="badge" data-mention={mention || undefined} {...props}>
      {count}
    </span>
  );
}

// #endregion

// #region Export

export const Sidebar = {
  Root,
  Header,
  SectionLabel,
  List,
  Item,
  Badge,
};

// #endregion
