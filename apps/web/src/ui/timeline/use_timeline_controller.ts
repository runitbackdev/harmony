import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEventData as TimelineEvent } from "@harmony/harmony-bindings-web";
import { useReactVirtualizerPort } from "./virtualizer_port";
import { estimateEventSize } from "./estimate_size";
import { eventKey, lastEventKey, newMessageCount } from "./new_message_count";

const GROUP_INTERVAL_MS = 8 * 60 * 1000;
const LOAD_MORE_THRESHOLD = 5;
const FLASH_MS = 1500;

function computeGrouping(events: TimelineEvent[]) {
  const grouped: boolean[] = [];
  let groupStartTime = 0;

  for (let index = 0; index < events.length; index++) {
    const current = events[index];
    const previous = index > 0 ? events[index - 1] : null;
    const sameGroup =
      previous?.content.type === "message" &&
      current.content.type === "message" &&
      previous.sender === current.sender &&
      current.timestamp - groupStartTime < GROUP_INTERVAL_MS;

    if (!sameGroup) groupStartTime = current.timestamp;
    grouped.push(sameGroup);
  }
  return grouped;
}

interface TimelineControllerOptions {
  events: TimelineEvent[];
  onLoadMore?: () => Promise<boolean>;
  onJumpToEvent?: (eventId: string) => void;
}

export function useTimelineController({
  events,
  onLoadMore,
  onJumpToEvent,
}: TimelineControllerOptions) {
  const filtered = useMemo(
    () => events.filter((event) => event.content.type !== "unknown"),
    [events],
  );
  const grouping = useMemo(() => computeGrouping(filtered), [filtered]);

  const getItemKey = useCallback((index: number) => eventKey(filtered[index], index), [filtered]);
  const estimateSize = useCallback(
    (index: number) => estimateEventSize(filtered[index], grouping[index]),
    [filtered, grouping],
  );

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const lastSeenKeyRef = useRef<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const {
    rows: portRows,
    totalSize,
    scrollRef,
    getVisibleRange,
    isPinnedToBottom,
    scrollToKey,
    scrollToBottom: portScrollToBottom,
  } = useReactVirtualizerPort({
    count: filtered.length,
    getItemKey,
    estimateSize,
    followOnAppend: isAtBottom,
  });

  const reachedStartRef = useRef(false);
  const loadingRef = useRef(false);

  const maybeLoadMore = useCallback(() => {
    if (!onLoadMore || loadingRef.current || reachedStartRef.current) return;
    if (getVisibleRange().startIndex > LOAD_MORE_THRESHOLD) return;

    loadingRef.current = true;
    onLoadMore()
      .then((reachedStart) => {
        if (reachedStart) reachedStartRef.current = true;
      })
      .catch((error) => console.error("[timeline] load more failed:", error))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [onLoadMore, getVisibleRange]);

  const handleScroll = useCallback(() => {
    setIsAtBottom(isPinnedToBottom());
    maybeLoadMore();
  }, [isPinnedToBottom, maybeLoadMore]);

  useEffect(() => {
    if (isAtBottom) {
      lastSeenKeyRef.current = lastEventKey(filtered);
      setNewCount(0);
    } else {
      setNewCount(newMessageCount(filtered, lastSeenKeyRef.current));
    }
  }, [filtered, isAtBottom]);

  const scrollToBottom = useCallback(() => portScrollToBottom("smooth"), [portScrollToBottom]);

  const jumpToEvent = useCallback(
    (key: string) => {
      const index = filtered.findIndex((event, i) => eventKey(event, i) === key);
      if (index === -1) {
        onJumpToEvent?.(key);
        return;
      }
      scrollToKey(key, { align: "center" });
      setFlashKey(key);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashKey(null), FLASH_MS);
    },
    [filtered, scrollToKey, onJumpToEvent],
  );

  const rows = portRows.map((row) => ({
    ...row,
    event: filtered[row.index],
    grouped: grouping[row.index],
    flashing: row.key === flashKey,
  }));

  return {
    scrollRef,
    totalSize,
    rows,
    newCount,
    isAtBottom,
    scrollToBottom,
    jumpToEvent,
    handleScroll,
  };
}
