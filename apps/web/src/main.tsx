import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";
import { homeserverOrigin, listenForTokenRequests } from "@harmony/react";
import { HarmonyClient, configureHarmony, configureHomeserver, hostTarget } from "@harmony/core";
import { whenMediaReady } from "@harmony/core";
import "./index.css";
import App from "./App.tsx";
import { sessionStore } from "@/lib/session";
import { TransportSharedWorker } from "./transport/shared-worker";
import { TransportTauri } from "./transport/tauri";
import HarmonyWorker from "./transport/worker?sharedworker";

// Host target is left to the runtime sniff — the desktop shell loads this same
// bundle and identifies itself via `window.__TAURI__`.
if (import.meta.env.VITE_HOMESERVER_URL) {
  configureHomeserver(import.meta.env.VITE_HOMESERVER_URL);
}

configureHarmony(() => {
  if (hostTarget() === "desktop") return new HarmonyClient(new TransportTauri());
  const worker = new HarmonyWorker({ name: "harmony-sync" });
  return new HarmonyClient(new TransportSharedWorker(worker.port));
});

if (import.meta.env.DEV) {
  scan({ enabled: true });
}

if ("serviceWorker" in navigator) {
  listenForTokenRequests(async () => {
    const session = await sessionStore.get();
    return session ? { token: session.accessToken, homeserverOrigin: homeserverOrigin() } : null;
  });

  const swUrl = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js";
  navigator.serviceWorker.register(swUrl, { type: "module" }).catch((err) => {
    console.error("[sw] registration failed:", err);
  });

  // Start the claim round-trip immediately so a hard-reloaded page is (likely)
  // controlled by the time the boot gate awaits it. Memoized — the route's
  // `whenMediaReady` reuses this same in-flight promise.
  void whenMediaReady();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
