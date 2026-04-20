import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Progressive infinite scroll: starts with `initial` items and appends
 * `batch` more each time the sentinel enters the viewport.
 */
export function useInfiniteScroll<T>(
  items: T[],
  opts?: { initial?: number; batch?: number; resetKey?: unknown },
) {
  const initial = opts?.initial ?? 24;
  const batch = opts?.batch ?? 24;
  const resetKey = opts?.resetKey;

  const [visibleCount, setVisibleCount] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(initial);
  }, [resetKey, initial]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(items.length, c + batch));
        }
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, items.length, batch]);

  return { visibleItems, sentinelRef, hasMore };
}
