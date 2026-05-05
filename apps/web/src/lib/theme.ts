import { proxy, useSnapshot } from "valtio";

export const THEMES = ["cerberus", "mona", "vox", "astra", "kyoto"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "astra";
const STORAGE_KEY = "harmony.theme";

function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (THEMES as readonly string[]).includes(stored)) return stored as Theme;
  return DEFAULT_THEME;
}

const state = proxy({ theme: readStoredTheme() });

if (typeof document !== "undefined") {
  document.documentElement.dataset.theme = state.theme;
}

export function setTheme(next: Theme): void {
  state.theme = next;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, next);
  }
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const snap = useSnapshot(state);
  return [snap.theme, setTheme];
}

export function cycleTheme(current: Theme): Theme {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length];
}
