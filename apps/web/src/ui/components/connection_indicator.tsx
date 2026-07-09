import { memo } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// #region ConnectionIndicator

/** Visual tone of the connection dot, decoupled from protocol-level status so
 *  this primitive stays presentational. */
export type ConnectionTone = "online" | "pending" | "offline" | "error";

const TONE_COLOR: Record<ConnectionTone, string> = {
  online: "bg-success",
  pending: "bg-warn",
  offline: "bg-faint",
  error: "bg-danger",
};

export interface ConnectionIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  tone: ConnectionTone;
  /** Human-readable state, used as the accessible name and hover tooltip. */
  label: string;
  /** Pulse the dot to signal an in-flight or unstable state. */
  pulse?: boolean;
}

/**
 * A small status dot that communicates connection health. Pair with a
 * `label` describing the state; consumers map their own status enum to a
 * `tone`. Modeled on `Sidebar.Dot`'s ping treatment.
 */
const ConnectionIndicator = memo(function ConnectionIndicator({
  tone,
  label,
  pulse,
  className,
  ...props
}: ConnectionIndicatorProps) {
  return (
    <span
      data-scope="connection-indicator"
      data-part="root"
      data-tone={tone}
      role="status"
      aria-live="polite"
      aria-label={label}
      title={label}
      className={cn("relative flex size-2.5", className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden
          className={cn(
            "absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping",
            TONE_COLOR[tone],
          )}
        />
      )}
      <span
        aria-hidden
        className={cn("relative inline-flex size-2.5 rounded-full", TONE_COLOR[tone])}
      />
    </span>
  );
});

export { ConnectionIndicator };

// #endregion
