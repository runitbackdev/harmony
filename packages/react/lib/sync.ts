import { harmony } from "@harmony/core";
import { type SyncStatusKind } from "@harmony/protocol";
import { useEffect, useState } from "react";

export function useSync() {
  useEffect(() => {
    harmony.sync.start();

    return () => harmony.sync.stop();
  }, []);
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
