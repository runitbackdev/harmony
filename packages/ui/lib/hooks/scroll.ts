import { useEffect, useRef, useState } from "react";

const AT_BOTTOM_THRESHOLD = 50;
const LOAD_MORE_MARGIN = "200px 0px 0px 0px";

export function useStickToBottom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  itemCount: number,
) {
  const isAtBottom = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleScroll() {
      const container = containerRef.current;
      if (!container) return;
      isAtBottom.current =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        AT_BOTTOM_THRESHOLD;
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isAtBottom.current) return;
    container.scrollTop = container.scrollHeight;
  }, [containerRef, itemCount]);
}

export function useLoadMoreOnScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sentinelRef: React.RefObject<HTMLDivElement | null>,
  onLoadMore?: () => Promise<boolean>,
) {
  const [reachedStart, setReachedStart] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container || reachedStart || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore().then((hitStart) => {
            if (hitStart) setReachedStart(true);
          });
        }
      },
      { root: container, rootMargin: LOAD_MORE_MARGIN },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [containerRef, sentinelRef, reachedStart, onLoadMore]);
}
