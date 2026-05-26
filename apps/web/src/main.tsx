import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";
import { HOMESERVER_ORIGIN, listenForTokenRequests } from "@harmony/react";
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
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
