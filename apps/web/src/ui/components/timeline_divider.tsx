import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// #region DateDivider

interface DateDividerProps extends HTMLAttributes<HTMLDivElement> {
  timestamp: number;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function DateDivider({ timestamp, className, ...props }: DateDividerProps) {
  return (
    <div
      data-scope="timeline-divider"
      data-part="date"
      className={cn("flex items-center gap-3 py-3", className)}
      {...props}
    >
      <div className="h-px flex-1 bg-soft" />
      <span className="text-data font-medium text-sub">{formatDate(timestamp)}</span>
      <div className="h-px flex-1 bg-soft" />
    </div>
  );
}

// #endregion

// #region ReadMarker

function ReadMarker({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-scope="timeline-divider"
      data-part="read-marker"
      className={cn("flex items-center gap-3 py-2", className)}
      {...props}
    >
      <div className="h-px flex-1 bg-danger" />
      <span className="text-data font-medium text-danger">New</span>
      <div className="h-px flex-1 bg-danger" />
    </div>
  );
}

// #endregion

// #region TimelineStart

function TimelineStart({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-scope="timeline-divider"
      data-part="timeline-start"
      className={cn("py-4 text-center text-data text-sub", className)}
      {...props}
    >
      This is the beginning of the conversation.
    </div>
  );
}

// #endregion

export { DateDivider, ReadMarker, TimelineStart };
