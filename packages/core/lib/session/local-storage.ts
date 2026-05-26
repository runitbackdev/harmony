import type { SessionData } from "@harmony/wasm";
import type { SessionStore } from "./store";

const STORAGE_KEY = "harmony_session";

/**
 * Web adapter backed by `window.localStorage`. Sync reads under the hood;
 * the interface stays async so other hosts can plug in without changing
 * callers.
 */
export class LocalStorageSessionStore implements SessionStore {
  async get(): Promise<SessionData | null> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async set(session: SessionData): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  }
}
