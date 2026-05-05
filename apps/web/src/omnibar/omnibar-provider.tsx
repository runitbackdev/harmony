import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { OmnibarContext } from "./use-omnibar";
import { registry } from "./registry";
import { STATIC_COMMANDS } from "./commands";

export function OmnibarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  useEffect(() => {
    const unsubs = STATIC_COMMANDS.map((c) => registry.register(c));
    return () => unsubs.forEach((fn) => fn());
  }, []);

  useHotkey("Mod+K", toggle, { preventDefault: true });

  return <OmnibarContext.Provider value={value}>{children}</OmnibarContext.Provider>;
}
