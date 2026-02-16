import type { HTMLAttributes, ReactNode } from "react";
import "./styles.css";

// #region Root

interface RootProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

function Root({ children, ...props }: RootProps) {
  return (
    <nav data-component="space-rail" {...props}>
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
  children: ReactNode;
}

function Item({ active, unread, mentionCount, children, ...props }: ItemProps) {
  return (
    <button
      data-part="item"
      data-active={active || undefined}
      data-unread={unread || undefined}
      {...props}
    >
      <span data-part="indicator" />
      {children}
      {mentionCount != null && mentionCount > 0 && (
        <span data-part="unread-dot">{mentionCount}</span>
      )}
    </button>
  );
}

// #endregion

// #region Separator

function Separator(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-part="separator" {...props} />;
}

// #endregion

// #region Export

export const Rail = {
  Root,
  Item,
  Separator,
};

// #endregion
