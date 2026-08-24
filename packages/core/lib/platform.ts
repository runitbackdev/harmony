export type HostTarget = "web" | "desktop" | "mobile";

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

let configured: HostTarget | null = null;

export function configureHost(host: HostTarget) {
  configured = host;
}

// Falls back to sniffing the Tauri global so web and desktop keep working
// without an explicit bootstrap call. Mobile has no such tell and must
// configure before the first read.
export function hostTarget() {
  configured ??=
    typeof window !== "undefined" && typeof window.__TAURI__ !== "undefined" ? "desktop" : "web";
  return configured;
}
