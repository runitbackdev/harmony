import { useCallback, useEffect, useState } from "react";

export const THEMES = ["cerberus", "mona", "vox", "astra", "kyoto"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "astra";
const STORAGE_KEY = "harmony.theme";

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (THEMES as readonly string[]).includes(stored)) return stored as Theme;
  return DEFAULT_THEME;
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}

export function cycleTheme(current: Theme): Theme {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length];
}
