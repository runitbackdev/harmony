import { command, subscribe } from "@harmony/core";
import { useStream } from "@harmony/react";

export const stopSync = () => command("sync.stop", undefined);

export const subscribeSync = (onChunk: Parameters<typeof subscribe<"sync.start">>[2]) =>
  subscribe("sync.start", undefined, onChunk);

/** Starts Matrix sync for the lifetime of the calling component. Mount once
 *  at the authenticated layout — room list, members, timeline all depend
 *  on the room-list-service this populates. */
export const useSync = () => useStream("sync.start", undefined);
