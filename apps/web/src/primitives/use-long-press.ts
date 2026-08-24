import { useCallback, useEffect, useMemo, useRef } from "react";

const MOVE_TOLERANCE = 10;

interface LongPressPoint {
  x: number;
  y: number;
}

interface UseLongPressOptions {
  threshold?: number;
  onLongPress: (point: LongPressPoint) => void;
}

export function useLongPress({ onLongPress, threshold = 500 }: UseLongPressOptions) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<LongPressPoint | null>(null);
  const latest = useRef(onLongPress);

  useEffect(() => {
    latest.current = onLongPress;
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const { clientX, clientY } = e.touches[0];
      origin.current = { x: clientX, y: clientY };
      clearTimer();
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        if (origin.current) latest.current(origin.current);
      }, threshold);
    },
    [clearTimer, threshold],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const point = origin.current;
      if (timer.current === undefined || !point || e.touches.length !== 1) return;
      const { clientX, clientY } = e.touches[0];
      if (
        Math.abs(clientX - point.x) > MOVE_TOLERANCE ||
        Math.abs(clientY - point.y) > MOVE_TOLERANCE
      ) {
        clearTimer();
      }
    },
    [clearTimer],
  );

  const onTouchEnd = useCallback(() => {
    clearTimer();
    origin.current = null;
  }, [clearTimer]);

  // Android fires a native contextmenu on touch long-press. Callers gate their own
  // onContextMenu on this so the row doesn't open the menu twice.
  const isTouching = useCallback(() => origin.current !== null, []);

  const longPressProps = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }),
    [onTouchStart, onTouchMove, onTouchEnd],
  );

  return { longPressProps, isTouching };
}
