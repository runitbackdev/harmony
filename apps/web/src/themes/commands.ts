import { Palette } from "lucide-react";
import { cycleTheme, THEMES, useTheme, type Theme } from "@/lib/theme";
import { useOmnibarCommands, type Command } from "@/omnibar";

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function buildThemeCommands(theme: Theme, setTheme: (next: Theme) => void): Command[] {
  return [
    {
      id: "theme.cycle",
      label: "Cycle to next theme",
      icon: Palette,
      keywords: ["theme", "switch", "next", "dark", "light"],
      defaultScore: 0.9,
      perform: () => setTheme(cycleTheme(theme)),
    },
    ...THEMES.map<Command>((t) => ({
      id: `theme.set-${t}`,
      label: `Switch to ${capitalize(t)} theme`,
      icon: Palette,
      keywords: ["theme", t],
      perform: () => setTheme(t),
    })),
  ];
}

/** Registers global theme-switching commands. Mount once at app root. */
export function useThemeCommands(): void {
  const [theme, setTheme] = useTheme();
  useOmnibarCommands(buildThemeCommands(theme, setTheme), [theme]);
}
