import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";
import { HOMESERVER_ORIGIN, listenForTokenRequests } from "@harmony/react";
import { whenMediaReady } from "@harmony/core";
import "./index.css";
import App from "./App.tsx";
import { sessionStore } from "@/lib/session";

if (import.meta.env.DEV) {
  scan({ enabled: true });
}

if ("serviceWorker" in navigator) {
  listenForTokenRequests(async () => {
    const session = await sessionStore.get();
    return session ? { token: session.accessToken, homeserverOrigin: HOMESERVER_ORIGIN } : null;
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
