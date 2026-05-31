import { ConnectionIndicator } from "@/ui";
import type { ConnectionTone } from "@/ui";
import { useSyncStatus } from "@/sync/api";
import type { ConnectionStatus } from "@/sync/api";

const VIEW: Record<ConnectionStatus, { tone: ConnectionTone; label: string; pulse?: boolean }> = {
  connecting: { tone: "pending", label: "Connecting…", pulse: true },
  syncing: { tone: "online", label: "Connected" },
  reconnecting: { tone: "pending", label: "Reconnecting…", pulse: true },
  stopped: { tone: "offline", label: "Disconnected" },
  error: { tone: "error", label: "Connection error" },
};

/**
 * Live connection indicator. Subscribes to the sync status stream and renders
 * a status dot in the persistent chrome so the user always knows whether
 * Harmony is talking to the homeserver.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const status = useSyncStatus();
  const view = VIEW[status];
  return <ConnectionIndicator className={className} {...view} />;
}
