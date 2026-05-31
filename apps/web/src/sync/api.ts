import { command, subscribe } from "@harmony/core";
import type { SyncStatus } from "@harmony/core";
import { useStream } from "@harmony/react";

export const stopSync = () => command("sync.stop", undefined);

export const subscribeSync = (onChunk: Parameters<typeof subscribe<"sync.start">>[2]) =>
  subscribe("sync.start", undefined, onChunk);

/** Starts Matrix sync for the lifetime of the calling component. Mount once
 *  at the authenticated layout — room list, members, timeline all depend
 *  on the room-list-service this populates. */
export const useSync = () => useStream("sync.start", undefined);

/** Connection state surfaced to the UI. `"connecting"` covers the window
 *  before the sync service has emitted its first state (or while the
 *  subscription is still opening); everything else mirrors `SyncStatus`. */
export type ConnectionStatus = SyncStatus | "connecting";

/** Latest Matrix connection state. Drives the connection indicator. Opening a
 *  second `sync.start` subscription is cheap — startup is idempotent and only
 *  status frames stream over it. */
export function useSyncStatus(): ConnectionStatus {
  const { status, chunks } = useSync();
  const latest = chunks.at(-1);
  if (latest) return latest;
  return status === "error" ? "error" : "connecting";
}
