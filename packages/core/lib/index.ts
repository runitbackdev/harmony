export { configureHomeserver, homeserverOrigin, homeserverUrl } from "./config";
export { configureHost, hostTarget } from "./platform";
export type { HostTarget } from "./platform";
export { mediaSrc, mediaThumbnailSrc } from "./media";
export { listenForTokenRequests, setMediaAuth, isMediaReady, whenMediaReady } from "./media-worker";

// Bridge primitives. The HarmonyClient class is exported for tests and
// alternate hosts; everyday consumers use the free functions.
export { HarmonyClient, configureHarmony, rpc, command, subscribe } from "./harmony";

// Re-export the specta-generated DTO types so apps don't need to depend on a
// per-target binding artifact. Sourced from the target-neutral generated
// declarations, not the wasm package — mobile has no wasm build to typecheck
// against.
export type * from "./protocol/types.generated";
export type { SessionData as Session } from "./protocol/types.generated";
