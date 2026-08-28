'use client';

import { useEffect, useRef, useState } from 'react';

export const ANCHOR_FIND_TIMEOUT_MS = 12_000;
export const ANCHOR_REACQUIRE_TIMEOUT_MS = 1600;

export type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function rectsEqual(a: AnchorRect | null, b: AnchorRect | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

export function measure(el: HTMLElement): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// True when the element is genuinely on screen for the user: rendered,
// non-hidden, and (only when acquiring — checkCover) the top-most content at
// its center. The cover check keeps the finder from latching onto a closed
// sheet's still-mounted, painted-over controls, but must NOT run during
// tracking: open sheets legitimately float transparent gesture layers over
// their content, which would read as "covered" and kill a valid highlight.
export function isUsableAnchor(
  el: HTMLElement,
  rect: AnchorRect,
  checkCover: boolean,
): boolean {
  if (!el.isConnected || rect.width < 1 || rect.height < 1) return false;
  const hidden =
    typeof (el as any).checkVisibility === 'function'
      ? !(el as any).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      : false;
  if (hidden) return false;
  if (!checkCover) return true;
  // Probe several points, not just the center: decorative layers (the frog's
  // oversized transparent canvas) can overlap part of an anchor without
  // actually obscuring it. A genuinely buried anchor fails every probe.
  const cy = rect.top + rect.height / 2;
  const probes = [0.5, 0.2, 0.8].map(
    (fraction) => [rect.left + rect.width * fraction, cy] as const,
  );
  let sawInViewportProbe = false;
  for (const [px, py] of probes) {
    if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) {
      continue;
    }
    sawInViewportProbe = true;
    const hit = document.elementFromPoint(px, py);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) {
      return true;
    }
    // The tour's own dim covers the whole viewport by design. Counting it as
    // cover would make every anchor unacquirable the moment the scrim is up.
    if (hit.closest('[data-tour-scrim]')) return true;
  }
  return !sawInViewportProbe;
}

export type AnchorTrackerOptions = {
  /** CSS selector for the anchor; null disables the tracker entirely. */
  selector: string | null;
  /** Changing this restarts the search from scratch (new step / chapter). */
  resetKey: string | null;
  enabled?: boolean;
  /** Skip the top-most-element test at acquisition. Default on. */
  coverCheck?: boolean;
  timeoutMs?: number;
  /** How long to keep hunting for an anchor that was acquired and then lost. */
  reacquireTimeoutMs?: number;
  /** Narrow which matching elements may be acquired. */
  filter?: (el: HTMLElement) => boolean;
  /** Must hold both to acquire and to keep tracking; false releases the anchor. */
  gate?: () => boolean;
  /** Scroll a comfortably-offscreen anchor into view once per resetKey. */
  scrollIntoView?: boolean;
  /** Called when the anchor never showed up within the timeout. */
  onTimeout?: () => void;
};

export function useAnchorTracker({
  selector,
  resetKey,
  enabled = true,
  coverCheck = true,
  timeoutMs,
  reacquireTimeoutMs = ANCHOR_REACQUIRE_TIMEOUT_MS,
  filter,
  gate,
  scrollIntoView = true,
  onTimeout,
}: AnchorTrackerOptions) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  // Hide the overlay while the anchor is animating (sheet opening/closing) —
  // a ring chasing a sliding control reads as a glitch.
  const [settled, setSettled] = useState(true);
  // While the user scrolls, position updates must be instant — the glide
  // transition (meant for slow layout drifts) reads as the ring lagging
  // behind its target.
  const [scrolling, setScrolling] = useState(false);
  // Bumped when a tracked anchor is lost so the search effect runs again
  // (with its timeout) instead of leaving a zombie with no anchor.
  const [searchNonce, setSearchNonce] = useState(0);

  const lastRectRef = useRef<AnchorRect | null>(null);
  const scrollQuietTimerRef = useRef<number | null>(null);
  const scrolledRef = useRef<string | null>(null);
  const hadAnchorRef = useRef(false);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    hadAnchorRef.current = false;
  }, [resetKey]);

  // Find the anchor element; give up quietly if it never shows.
  useEffect(() => {
    setEl(null);
    setRect(null);
    if (!enabled || !selector || !resetKey) return;

    const limit = hadAnchorRef.current
      ? reacquireTimeoutMs
      : timeoutMs ?? ANCHOR_FIND_TIMEOUT_MS;
    const startedAt = Date.now();

    const find = () => {
      if (gateRef.current && !gateRef.current()) return false;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      for (const candidate of candidates) {
        if (filterRef.current && !filterRef.current(candidate)) continue;
        const r = measure(candidate);
        if (isUsableAnchor(candidate, r, coverCheck)) {
          hadAnchorRef.current = true;
          lastRectRef.current = r;
          // Start hidden: if the anchor is inside an opening sheet the next
          // measurements still move, and the ring must not paint mid-slide.
          // A static anchor settles on the first tracker tick (~150ms).
          setSettled(false);
          setEl(candidate);
          setRect(r);
          return true;
        }
      }
      return false;
    };

    if (find()) return;
    const interval = window.setInterval(() => {
      if (find()) {
        window.clearInterval(interval);
        return;
      }
      if (Date.now() - startedAt > limit) {
        window.clearInterval(interval);
        onTimeoutRef.current?.();
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [
    resetKey,
    selector,
    enabled,
    coverCheck,
    timeoutMs,
    reacquireTimeoutMs,
    searchNonce,
  ]);

  // Keep the rect glued to the element; restart the search if it leaves the
  // DOM (sheet closed, list re-rendered).
  useEffect(() => {
    if (!el) return;

    if (scrollIntoView && scrolledRef.current !== resetKey) {
      scrolledRef.current = resetKey;
      // Only scroll when the anchor isn't comfortably in view — a smooth
      // scroll while the user is already reaching for a visible target makes
      // their tap land on whatever slides under the finger.
      const r = el.getBoundingClientRect();
      const comfortablyVisible =
        r.top >= 72 && r.bottom <= window.innerHeight - 96;
      if (!comfortablyVisible) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    const update = () => {
      const next = measure(el);
      const gateLost = !!gateRef.current && !gateRef.current();
      if (gateLost || !isUsableAnchor(el, next, false)) {
        setEl(null);
        setRect(null);
        setSearchNonce((n) => n + 1);
        return;
      }
      const previous = lastRectRef.current;
      lastRectRef.current = next;
      // Small drifts (a toolbar lifting for a toast) are followed with a CSS
      // glide on the overlay; only big jumps — sheets sliding, page scrolls —
      // hide it until the anchor comes to rest.
      const moved =
        !!previous &&
        Math.abs(previous.top - next.top) + Math.abs(previous.left - next.left) >
          120;
      setSettled(!moved);
      setRect((prev) => (rectsEqual(prev, next) ? prev : next));
    };
    const onScroll = () => {
      setScrolling(true);
      if (scrollQuietTimerRef.current) {
        window.clearTimeout(scrollQuietTimerRef.current);
      }
      scrollQuietTimerRef.current = window.setTimeout(
        () => setScrolling(false),
        160,
      );
      update();
    };
    const interval = window.setInterval(update, 150);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(interval);
      if (scrollQuietTimerRef.current) {
        window.clearTimeout(scrollQuietTimerRef.current);
      }
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [el, resetKey, scrollIntoView]);

  return { el, rect, settled, scrolling, hadAnchor: hadAnchorRef };
}
