import { createContext, useContext } from "react";

export interface OmnibarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const OmnibarContext = createContext<OmnibarContextValue | null>(null);

export function useOmnibar(): OmnibarContextValue {
  const ctx = useContext(OmnibarContext);
  if (!ctx) throw new Error("useOmnibar must be used inside <OmnibarProvider>");
  return ctx;
}
