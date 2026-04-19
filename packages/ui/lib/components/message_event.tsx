import type { HTMLAttributes } from "react";
import { cn } from "../utils";
import { sanitizeHtml } from "../sanitize";
import { MxAvatar } from "./mx_avatar";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

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
  edited?: boolean;
  editing?: React.ReactNode;
  reactions?: React.ReactNode;
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
  edited,
  editing,
  reactions,
  ...props
}: MessageEventProps) {
  const time = timeFormatter.format(timestamp);

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
          <MxAvatar mxc={avatar ?? null} name={sender} size={96} className="size-10" />
        )}
      </div>
      <div className="relative min-w-0 flex-1">
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
        {editing ??
          (formattedBody ? (
            <div
              data-scope="message-event"
              data-part="body"
              data-edited={edited || undefined}
              className="rich-text text-sm leading-5 text-surface-800-200"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(formattedBody) }}
            />
          ) : (
            <div
              data-scope="message-event"
              data-part="body"
              data-edited={edited || undefined}
              className="text-sm leading-5 text-surface-800-200"
            >
              {body}
            </div>
          ))}
        {reactions}
      </div>
    </div>
  );
}

// #endregion

export { MessageEvent };
