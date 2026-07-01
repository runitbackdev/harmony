declare global {
  interface Window {
    // Set by the Tauri shell when `withGlobalTauri` is enabled; present
    // before page load, absent in a plain browser. Our native signal.
    __TAURI__?: unknown;
  }
}

export function isNative(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI__ !== "undefined";
}

// Single runtime swap point. Evaluated once at load; bake to a constant per
// build later if the dynamic check ever costs us.
export const IS_DESKTOP = isNative();
