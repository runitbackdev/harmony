export { HOMESERVER_ORIGIN, HOMESERVER_URL } from "./config";
export { IS_DESKTOP } from "./platform";
export { mediaSrc, mediaThumbnailSrc } from "./media";
export { listenForTokenRequests, setMediaAuth, isMediaReady, whenMediaReady } from "./media-worker";

// Bridge primitives. The HarmonyClient class is exported for tests and
// alternate hosts; everyday consumers use the free functions.
export { HarmonyClient, rpc, command, subscribe } from "./harmony";

// Re-export the tsify-generated DTO types so apps don't need to depend
// on @harmony/harmony-bindings-web directly.
export type * from "@harmony/harmony-bindings-web";
export type { SessionData as Session } from "@harmony/harmony-bindings-web";
