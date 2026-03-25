import type { HTMLAttributes } from "react";
import { Avatar } from "@skeletonlabs/skeleton-react";
import { cn } from "../utils";
import { sanitizeHtml } from "../sanitize";

// #region MessageEvent

interface MessageEventProps extends HTMLAttributes<HTMLDivElement> {
  sender: string;
  body: string;
  formattedBody?: string;
  timestamp: number;
  avatar?: string | null;
  pending?: boolean;
  grouped?: boolean;
  highlight?: boolean;
}

function getInitials(sender: string) {
  const parts = sender.split(/[\s_-]+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return sender.charAt(0).toUpperCase();
}

function MessageEvent({
  sender,
  body,
  formattedBody,
  timestamp,
  avatar,
  pending,
  grouped,
  className,
  highlight,
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
        highlight && "bg-warning-500/10 -mx-4 px-4",
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
        {formattedBody ? (
          <div
            data-scope="message-event"
            data-part="body"
            className="rich-text text-sm text-surface-800-200"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(formattedBody) }}
          />
        ) : (
          <div data-scope="message-event" data-part="body" className="text-sm text-surface-800-200">
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

// #endregion

export { MessageEvent };
