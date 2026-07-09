import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";

type ScrollAlignment = "start" | "center" | "end" | "auto";

const AT_BOTTOM_THRESHOLD = 50;
const DEFAULT_OVERSCAN = 8;
const BOTTOM_PADDING = 16;

export interface VirtualRow {
  key: string;
  index: number;
  start: number;
  size: number;
  measureRef: (node: Element | null) => void;
}

// Substrate-agnostic seam over the windowing engine. Exposes intent, never a
// settable scroll position — react-virtual today, an RN adapter later.
export interface VirtualizerPort {
  rows: VirtualRow[];
  totalSize: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  getVisibleRange: () => { startIndex: number; endIndex: number };
  getDistanceFromEnd: () => number;
  isPinnedToBottom: () => boolean;
  scrollToKey: (
    key: string,
    options?: { align?: ScrollAlignment; behavior?: ScrollBehavior },
  ) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface VirtualizerPortOptions {
  count: number;
  getItemKey: (index: number) => string;
  estimateSize: (index: number) => number;
  followOnAppend?: boolean | ScrollBehavior;
  scrollEndThreshold?: number;
  overscan?: number;
}

function defaultScrollBehavior(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  targetIndex: number,
) {
  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];
  const rendered = !!first && !!last && targetIndex >= first.index && targetIndex <= last.index;
  return rendered ? ("smooth" as const) : undefined;
}

export function useReactVirtualizerPort({
  count,
  getItemKey,
  estimateSize,
  followOnAppend = true,
  scrollEndThreshold = AT_BOTTOM_THRESHOLD,
  overscan = DEFAULT_OVERSCAN,
}: VirtualizerPortOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan,
    paddingEnd: BOTTOM_PADDING,
    anchorTo: "end",
    followOnAppend,
    scrollEndThreshold,
  });

  // The core only follows *appends* (last key changed) — history backfill
  // prepends, which it treats as "preserve position" instead. And a prior
  // scrollToEnd leaves a reconcile loop pinned to a now-stale index that
  // drags the viewport back up. While following, re-anchor on every count
  // change: each scrollToEnd also replaces that stale reconcile target.
  const followRef = useRef(followOnAppend);
  followRef.current = followOnAppend;
  useLayoutEffect(() => {
    if (count === 0 || !followRef.current) return;
    virtualizer.scrollToEnd();
  }, [count, virtualizer]);

  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const countRef = useRef(count);
  countRef.current = count;

  const getVisibleRange = useCallback(
    () => ({
      startIndex: virtualizer.range?.startIndex ?? 0,
      endIndex: virtualizer.range?.endIndex ?? 0,
    }),
    [virtualizer],
  );

  const getDistanceFromEnd = useCallback(() => virtualizer.getDistanceFromEnd(), [virtualizer]);

  // No explicit threshold: isAtEnd falls back to the scrollEndThreshold option,
  // so the pill logic and the core's follow/remeasure logic share one definition.
  const isPinnedToBottom = useCallback(() => virtualizer.isAtEnd(), [virtualizer]);

  const scrollToKey = useCallback(
    (key: string, options?: { align?: ScrollAlignment; behavior?: ScrollBehavior }) => {
      const resolveKey = getItemKeyRef.current;
      for (let index = 0; index < countRef.current; index++) {
        if (resolveKey(index) === key) {
          virtualizer.scrollToIndex(index, {
            align: options?.align ?? "center",
            behavior: options?.behavior ?? defaultScrollBehavior(virtualizer, index),
          });
          return;
        }
      }
    },
    [virtualizer],
  );

  const scrollToBottom = useCallback(
    (behavior?: ScrollBehavior) => virtualizer.scrollToEnd({ behavior }),
    [virtualizer],
  );

  const rows = virtualizer.getVirtualItems().map((item) => ({
    key: String(item.key),
    index: item.index,
    start: item.start,
    size: item.size,
    measureRef: virtualizer.measureElement,
  }));

  const port: VirtualizerPort = {
    rows,
    totalSize: virtualizer.getTotalSize(),
    scrollRef,
    getVisibleRange,
    getDistanceFromEnd,
    isPinnedToBottom,
    scrollToKey,
    scrollToBottom,
  };
  return port;
}
