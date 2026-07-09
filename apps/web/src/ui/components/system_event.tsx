import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// #region SystemEvent

interface SystemEventProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
}

function SystemEvent({ content, className, ...props }: SystemEventProps) {
  return (
    <div
      data-scope="system-event"
      data-part="root"
      className={cn("py-1 text-center text-data text-sub", className)}
      {...props}
    >
      <span data-scope="system-event" data-part="content">
        {content}
      </span>
    </div>
  );
}

// #endregion

export { SystemEvent };
