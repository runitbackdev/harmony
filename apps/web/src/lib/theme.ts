import { proxy, useSnapshot } from "valtio";

export type Mode = "light" | "dark";

const STORAGE_KEY = "harmony.theme";
const DEFAULT_MODE: Mode = "dark";

function readStoredMode() {
  if (typeof localStorage === "undefined") return DEFAULT_MODE;
  return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : DEFAULT_MODE;
}

const state = proxy({ mode: readStoredMode() });

function apply(mode: Mode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

apply(state.mode);

export function setMode(next: Mode) {
  state.mode = next;
  apply(next);
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
}

export function toggleMode() {
  setMode(state.mode === "dark" ? "light" : "dark");
}

export function useMode() {
  const snap = useSnapshot(state);
  return [snap.mode, setMode] as const;
}
