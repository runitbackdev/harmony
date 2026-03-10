import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// #region MessageEvent

interface MessageEventProps extends HTMLAttributes<HTMLDivElement> {
  sender: string;
  body: string;
  timestamp: number;
  pending?: boolean;
  grouped?: boolean;
}

function MessageEvent({
  sender,
  body,
  timestamp,
  pending,
  grouped,
  className,
  ...props
}: MessageEventProps) {
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      data-scope="message-event"
      data-part="root"
      data-state={pending ? "pending" : undefined}
      className={cn(
        "group flex flex-col",
        grouped ? "pt-0.5" : "pt-3",
        pending && "opacity-50",
        "transition-opacity duration-300",
        className,
      )}
      {...props}
    >
      {!grouped && (
        <div className="flex items-baseline gap-2">
          <span
            data-scope="message-event"
            data-part="sender"
            className="text-sm font-medium text-surface-950-50"
          >
            {sender}
          </span>
          <span
            data-scope="message-event"
            data-part="timestamp"
            className="text-xs text-surface-500"
          >
            {time}
          </span>
        </div>
      )}
      <div
        data-scope="message-event"
        data-part="body"
        className={cn("text-sm text-surface-800-200", grouped && "pl-0")}
      >
        {body}
      </div>
    </div>
  );
}

// #endregion

export { MessageEvent };
