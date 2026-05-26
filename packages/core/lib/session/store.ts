import type { SessionData } from "@harmony/wasm";

/**
 * Host-agnostic interface for persisting the user's session token.
 *
 * Async-only — every adapter (web localStorage, Tauri fs, RN
 * AsyncStorage, OS keyring) reports through the same shape so callers
 * don't conditionally branch on host.
 */
export interface SessionStore {
  get(): Promise<SessionData | null>;
  set(session: SessionData): Promise<void>;
  clear(): Promise<void>;
}
