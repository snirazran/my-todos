"use client";

import { useCallback, useEffect, useRef } from "react";
import { hapticTick } from "@/lib/haptics";

const COL_SELECTOR = '[data-col="true"]';
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 4;
const FLICK_VELOCITY = 0.3;
const COMMIT_FRACTION = 0.22;
const MOMENTUM_MS = 260;
const DESKTOP_INSET = 16;
const WHEEL_IDLE_MS = 140;
const DEPTH_SCALE = 0.05;
const DEPTH_FADE = 0.45;

type Spring = { response: number; damping: number };
const PAGE_SPRING: Spring = { response: 0.42, damping: 0.86 };
const BAND_SPRING: Spring = { response: 0.4, damping: 1 };
const REDUCED_SPRING: Spring = { response: 0.22, damping: 1 };

type Mode = "paged" | "free";

type Gesture = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startScroll: number;
  startIndex: number;
  lastWritten: number;
  state: "pending" | "dragging";
  samples: { t: number; x: number }[];
};

type Anim = { raf: number; token: number };

function rubberBand(offset: number, dimension: number) {
  const c = 0.55;
  const abs = Math.abs(offset);
  const banded = (1 - 1 / ((abs * c) / dimension + 1)) * dimension;
  return Math.sign(offset) * banded;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function isTextTarget(el: HTMLElement | null) {
  return !!el?.closest(
    'input, textarea, select, [contenteditable], [contenteditable="true"]',
  );
}

export function useBoardPager({
  scrollerRef,
  trackRef,
  enabled,
  isCardDragging,
  onSettled,
}: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  isCardDragging: () => boolean;
  onSettled?: (index: number) => void;
}) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const isCardDraggingRef = useRef(isCardDragging);
  isCardDraggingRef.current = isCardDragging;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const scrollAnim = useRef<Anim | null>(null);
  const bandAnim = useRef<Anim | null>(null);
  const tokenRef = useRef(0);
  const bandRef = useRef(0);
  const gestureRef = useRef<Gesture | null>(null);
  const animTargetIndexRef = useRef<number | null>(null);
  const lastSettledRef = useRef<number | null>(null);
  const wheelIdleRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const mode = (): Mode =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "paged" : "free";

  const columns = useCallback((): HTMLElement[] => {
    const s = scrollerRef.current;
    if (!s) return [];
    return Array.from(s.querySelectorAll<HTMLElement>(COL_SELECTOR));
  }, [scrollerRef]);

  const maxScroll = () => {
    const s = scrollerRef.current;
    return s ? Math.max(0, s.scrollWidth - s.clientWidth) : 0;
  };

  const positionFor = useCallback(
    (col: HTMLElement, m: Mode = mode()) => {
      const s = scrollerRef.current;
      if (!s) return 0;
      const raw =
        m === "paged"
          ? col.offsetLeft - (s.clientWidth - col.clientWidth) / 2
          : col.offsetLeft - DESKTOP_INSET;
      return Math.min(Math.max(0, raw), maxScroll());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollerRef],
  );

  const nearestIndex = useCallback(
    (at?: number, m: Mode = mode()) => {
      const s = scrollerRef.current;
      const cols = columns();
      if (!s || cols.length === 0) return 0;
      const x = at ?? s.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      cols.forEach((col, i) => {
        const d = Math.abs(positionFor(col, m) - x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollerRef, columns, positionFor],
  );

  const depthFrame = useRef(0);
  const applyDepth = useCallback(() => {
    depthFrame.current = 0;
    const s = scrollerRef.current;
    if (!s) return;
    const flat =
      mode() !== "paged" ||
      prefersReducedMotion() ||
      isCardDraggingRef.current();
    const center = s.scrollLeft + s.clientWidth / 2;
    for (const col of columns()) {
      if (flat) {
        if (col.style.transform) {
          col.style.transform = "";
          col.style.opacity = "";
        }
        continue;
      }
      const colCenter = col.offsetLeft + col.clientWidth / 2;
      const d = Math.min(
        1,
        Math.abs(colCenter - center) / (col.clientWidth + 12),
      );
      if (d < 0.002) {
        col.style.transform = "";
        col.style.opacity = "";
      } else {
        col.style.transform = `scale(${1 - DEPTH_SCALE * d})`;
        col.style.opacity = String(1 - DEPTH_FADE * d);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollerRef, columns]);
  const scheduleDepth = useCallback(() => {
    if (depthFrame.current) return;
    depthFrame.current = requestAnimationFrame(applyDepth);
  }, [applyDepth]);

  const setBand = useCallback(
    (px: number) => {
      bandRef.current = px;
      const track = trackRef.current;
      if (!track) return;
      track.style.transform =
        Math.abs(px) < 0.25 ? "" : `translate3d(${px}px,0,0)`;
    },
    [trackRef],
  );

  const stopAnim = (ref: React.RefObject<Anim | null>) => {
    if (ref.current) cancelAnimationFrame(ref.current.raf);
    ref.current = null;
  };

  const runSpring = useCallback(
    (
      ref: React.RefObject<Anim | null>,
      opts: {
        from: number;
        velocity: number;
        target: () => number;
        write: (v: number) => void;
        read?: () => number;
        spring: Spring;
        onDone?: () => void;
      },
    ) => {
      stopAnim(ref);
      const token = ++tokenRef.current;
      const k = Math.pow((2 * Math.PI) / opts.spring.response, 2);
      const c = (4 * Math.PI * opts.spring.damping) / opts.spring.response;
      let x = opts.from;
      let v = opts.velocity * 1000;
      let lastWritten = x;
      let last = performance.now();

      const step = (now: number) => {
        if (!ref.current || ref.current.token !== token) return;
        const dt = Math.min(0.034, (now - last) / 1000);
        last = now;
        if (opts.read) {
          const external = opts.read() - lastWritten;
          if (Math.abs(external) > 1.5) x += external;
        }
        const target = opts.target();
        const sub = 4;
        const h = dt / sub;
        for (let i = 0; i < sub; i++) {
          const a = -k * (x - target) - c * v;
          v += a * h;
          x += v * h;
        }
        if (Math.abs(x - target) < 0.5 && Math.abs(v) < 8) {
          opts.write(target);
          ref.current = null;
          opts.onDone?.();
          return;
        }
        opts.write(x);
        lastWritten = opts.read ? opts.read() : x;
        ref.current.raf = requestAnimationFrame(step);
      };
      ref.current = { raf: requestAnimationFrame(step), token };
    },
    [],
  );

  const settleBand = useCallback(
    (velocity = 0) => {
      if (Math.abs(bandRef.current) < 0.25) {
        setBand(0);
        return;
      }
      runSpring(bandAnim, {
        from: bandRef.current,
        velocity,
        target: () => 0,
        write: setBand,
        spring: prefersReducedMotion() ? REDUCED_SPRING : BAND_SPRING,
      });
    },
    [runSpring, setBand],
  );

  const animateToIndex = useCallback(
    (index: number, velocity = 0) => {
      const s = scrollerRef.current;
      const cols = columns();
      if (!s || cols.length === 0) return;
      const i = Math.max(0, Math.min(cols.length - 1, index));
      const dateKey = cols[i].dataset.dateKey;
      const m = mode();
      const findCol = () =>
        (dateKey
          ? s.querySelector<HTMLElement>(
              `${COL_SELECTOR}[data-date-key="${dateKey}"]`,
            )
          : null) ?? cols[i];
      animTargetIndexRef.current = i;
      runSpring(scrollAnim, {
        from: s.scrollLeft,
        velocity,
        target: () => positionFor(findCol(), m),
        write: (v) => {
          s.scrollLeft = v;
        },
        read: () => s.scrollLeft,
        spring: prefersReducedMotion() ? REDUCED_SPRING : PAGE_SPRING,
        onDone: () => {
          animTargetIndexRef.current = null;
          const settledCol = findCol();
          const settledIndex = columns().indexOf(settledCol);
          if (settledIndex >= 0) {
            if (
              m === "paged" &&
              lastSettledRef.current !== null &&
              lastSettledRef.current !== settledIndex
            ) {
              hapticTick();
            }
            lastSettledRef.current = settledIndex;
            onSettledRef.current?.(settledIndex);
          }
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollerRef, columns, positionFor, runSpring],
  );

  const currentIndex = useCallback(
    () => animTargetIndexRef.current ?? nearestIndex(),
    [nearestIndex],
  );

  const visibleCount = useCallback(() => {
    const s = scrollerRef.current;
    const col = columns()[0];
    if (!s || !col) return 1;
    return Math.max(
      1,
      Math.floor((s.clientWidth + 12) / (col.clientWidth + 12)),
    );
  }, [scrollerRef, columns]);

  const step = useCallback(
    (dir: 1 | -1, unit: "day" | "page" = "day") => {
      const size = unit === "page" ? Math.max(1, visibleCount() - 1) : 1;
      animateToIndex(currentIndex() + dir * size);
    },
    [animateToIndex, currentIndex, visibleCount],
  );

  const settle = useCallback(
    (velocity = 0) => {
      const s = scrollerRef.current;
      if (!s) return;
      const projected = s.scrollLeft + velocity * MOMENTUM_MS;
      animateToIndex(nearestIndex(projected), velocity);
    },
    [scrollerRef, animateToIndex, nearestIndex],
  );

  const stop = useCallback(() => {
    stopAnim(scrollAnim);
    animTargetIndexRef.current = null;
  }, []);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;

    const velocityOf = (g: Gesture) => {
      const now = performance.now();
      const recent = g.samples.filter((p) => now - p.t < 90);
      if (recent.length < 2) return 0;
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dt = last.t - first.t;
      return dt > 0 ? (last.x - first.x) / dt : 0;
    };

    const release = (g: Gesture) => {
      document.body.style.userSelect = "";
      const fingerVelocity = velocityOf(g);
      const scrollVelocity = -fingerVelocity;
      const band = bandRef.current;
      if (band !== 0) settleBand(fingerVelocity);

      const m = g.pointerType === "mouse" ? "free" : mode();
      if (m === "paged") {
        const cols = columns();
        const startCol = cols[g.startIndex];
        const travelled = startCol
          ? s.scrollLeft - positionFor(startCol, "paged")
          : 0;
        let target = nearestIndex(undefined, "paged");
        if (Math.abs(scrollVelocity) > FLICK_VELOCITY) {
          target = g.startIndex + Math.sign(scrollVelocity);
        } else if (
          startCol &&
          Math.abs(travelled) > startCol.clientWidth * COMMIT_FRACTION
        ) {
          target = g.startIndex + Math.sign(travelled);
        }
        animateToIndex(target, band !== 0 ? 0 : scrollVelocity);
      } else {
        settle(band !== 0 ? 0 : scrollVelocity);
      }
    };

    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (isCardDraggingRef.current()) {
        gestureRef.current = null;
        setBand(0);
        return;
      }
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (g.state === "pending") {
        const slop = g.pointerType === "mouse" ? MOUSE_SLOP : TOUCH_SLOP;
        if (Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy)) {
          g.state = "dragging";
          g.startX = e.clientX;
          g.startScroll = s.scrollLeft;
          g.lastWritten = s.scrollLeft;
          if (g.pointerType === "mouse") {
            s.setPointerCapture?.(e.pointerId);
            document.body.style.userSelect = "none";
            suppressClickRef.current = true;
          }
        } else if (Math.abs(dy) > slop) {
          gestureRef.current = null;
          return;
        } else {
          return;
        }
      }

      const external = s.scrollLeft - g.lastWritten;
      if (Math.abs(external) > 1.5) g.startScroll += external;

      const raw = g.startScroll - (e.clientX - g.startX);
      const max = maxScroll();
      const clamped = Math.min(Math.max(0, raw), max);
      s.scrollLeft = clamped;
      g.lastWritten = s.scrollLeft;
      setBand(-rubberBand(raw - clamped, s.clientWidth));
      g.samples.push({ t: performance.now(), x: e.clientX });
      if (g.samples.length > 12) g.samples.shift();
    };

    const onUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      if (g.pointerType === "mouse") s.releasePointerCapture?.(e.pointerId);
      if (g.state === "dragging") release(g);
    };

    const onDown = (e: PointerEvent) => {
      if (!enabledRef.current || isCardDraggingRef.current()) return;
      if (!e.isPrimary) return;
      const target = e.target as HTMLElement | null;
      if (isTextTarget(target)) return;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        if (target?.closest('[data-card-id], button, a, [role="button"]'))
          return;
      }
      stopAnim(scrollAnim);
      stopAnim(bandAnim);
      animTargetIndexRef.current = null;
      const startIndex = nearestIndex(
        undefined,
        e.pointerType === "mouse" ? "free" : mode(),
      );
      lastSettledRef.current = lastSettledRef.current ?? startIndex;
      gestureRef.current = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        startScroll: s.scrollLeft,
        startIndex,
        lastWritten: s.scrollLeft,
        state: "pending",
        samples: [{ t: performance.now(), x: e.clientX }],
      };
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    };

    s.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    s.addEventListener("click", onClickCapture, true);
    return () => {
      s.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      s.removeEventListener("click", onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scrollerRef,
    columns,
    positionFor,
    nearestIndex,
    animateToIndex,
    settle,
    settleBand,
    setBand,
  ]);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;

    const canScrollVertically = (from: HTMLElement | null, deltaY: number) => {
      let el = from;
      while (el && el !== s) {
        const style = getComputedStyle(el);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          const atTop = el.scrollTop <= 0;
          const atBottom =
            el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const scheduleIdleSettle = () => {
      if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = window.setTimeout(() => {
        wheelIdleRef.current = null;
        if (
          gestureRef.current ||
          scrollAnim.current ||
          isCardDraggingRef.current()
        )
          return;
        settle(0);
      }, WHEEL_IDLE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current || isCardDraggingRef.current() || e.ctrlKey)
        return;
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (horizontal) {
        if (scrollAnim.current) stop();
        scheduleIdleSettle();
        return;
      }
      if (canScrollVertically(e.target as HTMLElement, e.deltaY)) return;

      e.preventDefault();
      const notched =
        e.deltaMode === 1 ||
        (Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
      if (notched) {
        const from = animTargetIndexRef.current ?? nearestIndex();
        animateToIndex(from + Math.sign(e.deltaY));
        return;
      }
      if (scrollAnim.current) stop();
      s.scrollLeft += e.deltaY;
      scheduleIdleSettle();
    };

    s.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      s.removeEventListener("wheel", onWheel);
      if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
    };
  }, [scrollerRef, animateToIndex, nearestIndex, settle, stop]);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    scheduleDepth();
    s.addEventListener("scroll", scheduleDepth, { passive: true });
    window.addEventListener("resize", scheduleDepth);
    const mo = new MutationObserver(scheduleDepth);
    mo.observe(s, { attributes: true, attributeFilter: ["data-drag"] });
    return () => {
      s.removeEventListener("scroll", scheduleDepth);
      window.removeEventListener("resize", scheduleDepth);
      mo.disconnect();
      if (depthFrame.current) cancelAnimationFrame(depthFrame.current);
    };
  }, [scrollerRef, scheduleDepth]);

  useEffect(
    () => () => {
      stopAnim(scrollAnim);
      stopAnim(bandAnim);
    },
    [],
  );

  return {
    animateToIndex,
    step,
    settle,
    stop,
    currentIndex,
    refreshDepth: scheduleDepth,
  };
}
