import type { HTMLAttributes } from "react";
import type { ReplyTarget } from "@harmony/wasm";
import { Reply } from "lucide-react";
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
  formattedBody?: string | null;
  timestamp: number;
  avatar?: string | null;
  pending?: boolean;
  grouped?: boolean;
  highlight?: boolean;
  edited?: boolean;
  editing?: React.ReactNode;
  reactions?: React.ReactNode;
  replyTo?: ReplyTarget | null;
  onReplyClick?: (eventId: string) => void;
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
  replyTo,
  onReplyClick,
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
        {replyTo && <ReplyQuote replyTo={replyTo} onClick={onReplyClick} />}
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

// #region ReplyQuote

function ReplyQuote({
  replyTo,
  onClick,
}: {
  replyTo: ReplyTarget;
  onClick?: (eventId: string) => void;
}) {
  const name = replyTo.senderName ?? replyTo.sender ?? "unknown";
  const snippet = replyTo.redacted ? "[deleted message]" : (replyTo.body ?? "[unavailable]");

  return (
    <button
      type="button"
      data-scope="message-event"
      data-part="reply-quote"
      onClick={() => onClick?.(replyTo.eventId)}
      className="mb-1 flex max-w-full items-center gap-1.5 rounded border-l-2 border-surface-400-600 bg-surface-100-900 px-2 py-1 text-left text-xs text-surface-500 hover:border-primary-500 hover:text-surface-950-50 transition-colors"
    >
      <Reply size={12} className="shrink-0 -scale-x-100" />
      <span className="font-medium text-surface-700-300 truncate">{name}</span>
      <span className="truncate min-w-0">{snippet}</span>
    </button>
  );
}

// #endregion

export { MessageEvent };
