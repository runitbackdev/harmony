import { harmony } from "@harmony/core";
import { type SyncStatusKind } from "@harmony/protocol";
import { useEffect, useState } from "react";
import { proxy } from "valtio";

export const syncState = proxy({ ready: null as Promise<void> | null });

export function startSync() {
  if (syncState.ready) return;
  syncState.ready = harmony.sync.start();
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatusKind | null>(null);

  useEffect(() => {
    return harmony.on("h.sync.status", (message) => {
      setStatus(message.status);
    });
  }, []);

  return status;
}
