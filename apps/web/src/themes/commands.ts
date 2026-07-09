import { Moon } from "lucide-react";
import { toggleMode, useMode } from "@/lib/theme";
import { useOmnibarCommands, type Command } from "@/omnibar";

/** Registers the light/dark toggle command. Mount once at app root. */
export function useThemeCommands() {
  const [mode] = useMode();

  const command: Command = {
    id: "theme.toggle",
    label: mode === "dark" ? "Switch to light theme" : "Switch to dark theme",
    icon: Moon,
    keywords: ["theme", "dark", "light", "toggle", "appearance"],
    defaultScore: 0.9,
    perform: toggleMode,
  };

  useOmnibarCommands([command], [mode]);
}
