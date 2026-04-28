import { cloneElement, useEffect, useRef, type ReactElement, type Ref } from "react";
import { useDelayedUnmount } from "./use-delayed-unmount";
import { type TransitionStatus } from "./use-animated-unmount";
import { useMergeRefs } from "./use-merge-refs";

interface TransitionProps {
  open: boolean;
  children: ReactElement;
  onExited?: () => void;
}

function Transition({ open, children, onExited }: TransitionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const hasBeenOpen = useRef(open);
  const status = useDelayedUnmount(open, ref);
  const childRef = (children.props as { ref?: Ref<HTMLElement> }).ref;
  const mergedRef = useMergeRefs(ref, childRef);

  useEffect(() => {
    if (open) hasBeenOpen.current = true;
  }, [open]);

  useEffect(() => {
    if (status === "unmounted" && !open && hasBeenOpen.current) onExited?.();
  }, [status, open, onExited]);

  if (status === "unmounted") return null;

  return cloneElement(children, {
    ref: mergedRef,
    "data-status": status,
  } as Partial<typeof children.props> & { ref: Ref<HTMLElement>; "data-status": TransitionStatus });
}

export { Transition };
