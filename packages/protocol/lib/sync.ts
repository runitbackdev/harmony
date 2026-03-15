import type { Command, Request, Response, Stream } from "./base";

export type SyncStart = Request<"h.sync.start">;
export type SyncStarted = Response<"h.sync.started">;
export type SyncStop = Command<"h.sync.stop">;

export type SyncStatusKind = "syncing" | "reconnecting" | "error" | "stopped";
export type SyncStatus = Stream<"h.sync.status", { status: SyncStatusKind; message?: string }>;

export type SyncRequest = SyncStart;
export type SyncResponse = SyncStarted;
export type SyncCommand = SyncStop;
export type SyncStream = SyncStatus;
