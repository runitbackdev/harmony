import { useEffect, useState, type RefObject } from "react";

export type TransitionStatus = "initial" | "open" | "close" | "unmounted";

export function useAnimatedUnmount(
  status: TransitionStatus,
  ref: RefObject<HTMLElement | null>,
): TransitionStatus {
  const [internalStatus, setInternalStatus] = useState<TransitionStatus>(status);

  useEffect(() => {
    if (status !== "close") {
      setInternalStatus(status);
      return;
    }

    if (!ref.current) {
      setInternalStatus("unmounted");
      return;
    }

    setInternalStatus("close");

    setInternalStatus("close");
    const el = ref.current;
    let cancelled = false;
    let f2: number | undefined;

    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        if (cancelled) return;

        const animations = el.getAnimations({ subtree: true }).filter((a) => {
          const timing = (a.effect as KeyframeEffect | null)?.getComputedTiming();
          return timing?.iterations !== Infinity;
        });

        if (animations.length === 0) {
          setInternalStatus("unmounted");
          return;
        }

        void Promise.all(animations.map((a) => a.finished)).finally(() => {
          if (!cancelled) setInternalStatus("unmounted");
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(f1);
      if (f2 !== undefined) cancelAnimationFrame(f2);
    };
  }, [status, ref]);

  return internalStatus;
}
