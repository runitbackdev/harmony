export { HOMESERVER_ORIGIN, HOMESERVER_URL } from "./config";
export { listenForTokenRequests, setMediaAuth } from "./media-worker";

// Bridge primitives. The HarmonyClient class is exported for tests and
// alternate hosts; everyday consumers use the free functions.
export { HarmonyClient, rpc, command, subscribe } from "./harmony";

// Re-export the tsify-generated DTO types so apps don't need to depend
// on @harmony/wasm directly.
export type * from "@harmony/wasm";
export type { SessionData as Session } from "@harmony/wasm";
