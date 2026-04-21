import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

/**
 * Progressive infinite scroll: starts with `initial` items and appends
 * `batch` more each time the sentinel enters the viewport.
 */
export function useInfiniteScroll<T>(
  items: T[],
  opts?: {
    initial?: number;
    batch?: number;
    resetKey?: unknown;
    rootRef?: RefObject<HTMLElement | null>;
    enabled?: boolean;
  },
) {
  const initial = opts?.initial ?? 24;
  const batch = opts?.batch ?? 24;
  const resetKey = opts?.resetKey;
  const rootRef = opts?.rootRef;
  const enabled = opts?.enabled ?? true;

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
  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(items.length, c + batch));
  }, [batch, items.length]);

  useEffect(() => {
    if (!enabled) return;
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const root = rootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { root, rootMargin: '120px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, hasMore, loadMore, rootRef]);

  return { visibleItems, sentinelRef, hasMore, loadMore };
}
