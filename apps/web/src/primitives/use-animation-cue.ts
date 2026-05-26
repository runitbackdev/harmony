import { useCallback, useEffect, useState, type RefObject } from "react";

export function useAnimationCue<T extends HTMLElement>(
  ref: RefObject<T | null>,
): [active: boolean, fire: () => void] {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active || !ref.current) return;
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
          setActive(false);
          return;
        }

        void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
          if (!cancelled) setActive(false);
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(f1);
      if (f2 !== undefined) cancelAnimationFrame(f2);
    };
  }, [active, ref]);

  const fire = useCallback(() => setActive(true), []);

  return [active, fire];
}
