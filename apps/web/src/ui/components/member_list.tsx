import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";
import { MxAvatar } from "./mx_avatar";

interface MemberListProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function MemberList({ children, className, ...props }: MemberListProps) {
  return (
    <aside
      data-scope="member-list"
      data-part="root"
      className={cn(
        "flex h-full w-60 flex-col border-l border-surface-300-700 bg-surface-200-800",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

interface HeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Header({ children, className, ...props }: HeaderProps) {
  return (
    <div
      data-scope="member-list"
      data-part="header"
      className={cn("border-b border-surface-300-700 p-3", className)}
      {...props}
    >
      <div
        data-scope="member-list"
        data-part="header-title"
        className="text-base font-semibold text-surface-950-50"
      >
        {children}
      </div>
    </div>
  );
}

interface ListProps extends HTMLAttributes<HTMLUListElement> {
  children: ReactNode;
}

function List({ children, className, ...props }: ListProps) {
  return (
    <ul
      data-scope="member-list"
      data-part="list"
      className={cn("flex list-none flex-col gap-px p-1 px-2", className)}
      {...props}
    >
      {children}
    </ul>
  );
}

interface RowProps extends HTMLAttributes<HTMLButtonElement> {
  name: string;
  avatarUrl: string | null;
}

function Row({ name, avatarUrl, className, ...props }: RowProps) {
  return (
    <li data-scope="member-list" data-part="row-wrapper">
      <button
        data-scope="member-list"
        data-part="row"
        className={cn(
          "flex w-full items-center gap-2 rounded-container px-2 py-1.5",
          "cursor-pointer text-sm text-surface-600-400 transition-colors",
          "hover:bg-surface-300-700",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
          className,
        )}
        {...props}
      >
        <MxAvatar mxc={avatarUrl} name={name} size={96} className="size-6 shrink-0" />
        <span data-scope="member-list" data-part="row-name" className="truncate">
          {name}
        </span>
      </button>
    </li>
  );
}

MemberList.Header = Header;
MemberList.List = List;
MemberList.Row = Row;

export { MemberList };
