import type { HTMLAttributes } from "react";
import { Avatar } from "@skeletonlabs/skeleton-react";
import { cn } from "../utils";

// #region MessageEvent

interface MessageEventProps extends HTMLAttributes<HTMLDivElement> {
  sender: string;
  body: string;
  timestamp: number;
  avatar?: string | null;
  pending?: boolean;
  grouped?: boolean;
}

function getInitials(sender: string) {
  return sender.charAt(0).toUpperCase();
}

function MessageEvent({
  sender,
  body,
  timestamp,
  avatar,
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
        "group/message flex gap-4",
        grouped ? "py-px" : "pt-4",
        pending && "opacity-50",
        "transition-opacity duration-300",
        className,
      )}
      {...props}
    >
      <div
        data-scope="message-event"
        data-part="gutter"
        className="flex w-10 shrink-0 justify-center"
      >
        {grouped ? (
          <span
            data-scope="message-event"
            data-part="hover-timestamp"
            className="self-center whitespace-nowrap text-[10px] text-surface-500 opacity-0 group-hover/message:opacity-100 transition-opacity"
          >
            {time}
          </span>
        ) : (
          <Avatar className="size-10">
            {avatar && <Avatar.Image src={avatar} alt={sender} />}
            <Avatar.Fallback>{getInitials(sender)}</Avatar.Fallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
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
          className="text-sm text-surface-800-200"
        >
          {body}
        </div>
      </div>
    </div>
  );
}

// #endregion

export { MessageEvent };
