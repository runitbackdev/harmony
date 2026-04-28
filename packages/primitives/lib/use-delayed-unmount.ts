import { useEffect, useState, type RefObject } from "react";
import { useAnimatedUnmount, type TransitionStatus } from "./use-animated-unmount";

export function useDelayedUnmount(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
): TransitionStatus {
  const [everOpen, setEverOpen] = useState(open);

  useEffect(() => {
    if (open) setEverOpen(true);
  }, [open]);

  const requested: TransitionStatus = !everOpen ? "unmounted" : open ? "open" : "close";
  return useAnimatedUnmount(requested, ref);
}
