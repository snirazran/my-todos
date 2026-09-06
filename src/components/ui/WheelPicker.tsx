'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticTick } from '@/lib/haptics';

// UIScrollView's own feel: velocity decays exponentially, ~0.95 per 60fps
// frame — a time constant of about 325ms. Faster reads as sticky, slower
// drifts past where the thumb meant to stop.
const DECAY_PER_MS = 0.998;
const MIN_VELOCITY = 0.02;
// Below this the release was a nudge, not a flick — snap from where it sits
// rather than coasting off a rounding error.
const FLICK_THRESHOLD = 0.12;
const SNAP_MS = 260;
const MAX_VELOCITY = 6;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export interface WheelPickerProps {
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
  label: string;
  formatLabel?: (value: number) => string;
  itemHeight?: number;
  visibleItems?: number;
  className?: string;
  selectedClassName?: string;
  itemClassName?: string;
  /** Wrap past the ends instead of stopping — the iPhone timer's behaviour. */
  loop?: boolean;
}

export function WheelPicker({
  values,
  value,
  onChange,
  label,
  formatLabel,
  itemHeight = 40,
  visibleItems = 5,
  className = '',
  selectedClassName = 'text-white',
  itemClassName = 'text-white/45',
  loop = true,
}: Readonly<WheelPickerProps>) {
  const count = values.length;
  const height = itemHeight * visibleItems;
  const half = (visibleItems - 1) / 2;
  const bandTop = (height - itemHeight) / 2;

  // Offset is measured in items, not pixels, so wrapping is one modulo and the
  // rendered window is derived rather than scrolled.
  const offsetRef = useRef(Math.max(0, values.indexOf(value)));
  const [, forceRender] = useState(0);
  const rafRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const emittedRef = useRef(value);
  const snapRef = useRef<{ from: number; to: number; start: number } | null>(null);

  const paint = useCallback(() => forceRender((n) => n + 1), []);

  const wrap = useCallback(
    (offset: number) => {
      if (!loop) return Math.max(0, Math.min(count - 1, offset));
      return ((offset % count) + count) % count;
    },
    [count, loop],
  );

  const valueAt = useCallback(
    (index: number) => {
      if (count === 0) return value;
      return values[((index % count) + count) % count];
    },
    [count, values, value],
  );

  const emitFor = useCallback(
    (offset: number) => {
      const next = valueAt(Math.round(offset));
      if (next === undefined || next === emittedRef.current) return;
      emittedRef.current = next;
      hapticTick();
      onChange(next);
    },
    [onChange, valueAt],
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    snapRef.current = null;
    velocityRef.current = 0;
  }, []);

  const startSnap = useCallback((target: number) => {
    snapRef.current = {
      from: offsetRef.current,
      to: target,
      start: performance.now(),
    };
  }, []);

  // One loop drives both phases: coast on the release velocity until it dies,
  // then ease into the nearest detent. Each frame reports the item under the
  // band, so the value (and its tick) tracks the wheel rather than waiting for
  // it to stop.
  const runLoop = useCallback(() => {
    const frame = (now: number) => {
      const snap = snapRef.current;
      if (snap) {
        const t = Math.min(1, (now - snap.start) / SNAP_MS);
        offsetRef.current = snap.from + (snap.to - snap.from) * easeOutCubic(t);
        emitFor(offsetRef.current);
        paint();
        if (t >= 1) {
          offsetRef.current = wrap(snap.to);
          snapRef.current = null;
          rafRef.current = 0;
          emitFor(offsetRef.current);
          paint();
          return;
        }
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const last = lastTimeRef.current || now;
      const dt = Math.max(1, Math.min(64, now - last));
      lastTimeRef.current = now;

      offsetRef.current = wrap(offsetRef.current + velocityRef.current);
      velocityRef.current *= Math.pow(DECAY_PER_MS, dt);
      emitFor(offsetRef.current);
      paint();

      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        startSnap(Math.round(offsetRef.current));
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
  }, [emitFor, paint, startSnap, wrap]);

  // An outside change (a preset tap) animates to its detent instead of
  // teleporting, unless the wheel is the thing that reported it.
  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    const index = values.indexOf(value);
    if (index < 0) return;
    stop();
    const current = offsetRef.current;
    let target = index;
    if (loop) {
      const direct = index - wrap(current);
      const shortest =
        direct > count / 2
          ? direct - count
          : direct < -count / 2
            ? direct + count
            : direct;
      target = current + shortest;
    }
    startSnap(target);
    runLoop();
  }, [value, values, count, loop, stop, startSnap, runLoop, wrap]);

  useEffect(() => () => stop(), [stop]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    stop();
    draggingRef.current = true;
    lastYRef.current = event.clientY;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const dy = event.clientY - lastYRef.current;
    const dt = Math.max(1, now - lastTimeRef.current);
    lastYRef.current = event.clientY;
    lastTimeRef.current = now;

    const deltaItems = -dy / itemHeight;
    offsetRef.current = wrap(offsetRef.current + deltaItems);
    // Velocity is carried in items per frame so the coast picks up exactly
    // where the thumb left off.
    velocityRef.current = Math.max(
      -MAX_VELOCITY,
      Math.min(MAX_VELOCITY, (deltaItems / dt) * 16),
    );
    emitFor(offsetRef.current);
    paint();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone; the coast below is what matters.
    }
    if (Math.abs(velocityRef.current) < FLICK_THRESHOLD) {
      velocityRef.current = 0;
      startSnap(Math.round(offsetRef.current));
    }
    runLoop();
  };

  const step = (delta: number) => {
    stop();
    startSnap(Math.round(offsetRef.current) + delta);
    runLoop();
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    stop();
    offsetRef.current = wrap(offsetRef.current + event.deltaY / itemHeight);
    emitFor(offsetRef.current);
    paint();
    startSnap(Math.round(offsetRef.current));
    runLoop();
  };

  // Only the faces that can be seen are mounted; with loop on, the window
  // slides over the same values forever.
  const offset = offsetRef.current;
  const centre = Math.round(offset);
  const faces: Array<{ index: number; distance: number }> = [];
  for (let i = centre - half - 1; i <= centre + half + 1; i += 1) {
    if (!loop && (i < 0 || i > count - 1)) continue;
    faces.push({ index: i, distance: i - offset });
  }

  const format = formatLabel ?? String;
  const current = valueAt(Math.round(offset));

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={values[0]}
      aria-valuemax={values[count - 1]}
      aria-valuenow={current}
      aria-valuetext={format(current)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault();
          step(-1);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault();
          step(1);
        }
      }}
      className={`relative select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${className}`}
      style={{
        height,
        touchAction: 'none',
        cursor: 'grab',
        maskImage:
          'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
      }}
    >
      {faces.map(({ index, distance }) => {
        // The iPhone wheel is a cylinder: faces rotate away from the band and
        // fade as they go, which is what makes motion readable at speed.
        const angle = Math.max(-70, Math.min(70, distance * 22));
        const opacity = Math.max(0, 1 - Math.abs(distance) * 0.34);
        const isCurrent = Math.abs(distance) < 0.5;
        return (
          <div
            key={`face-${index}`}
            className={`absolute inset-x-0 flex items-center justify-center tabular-nums transition-colors ${
              isCurrent ? selectedClassName : itemClassName
            }`}
            style={{
              height: itemHeight,
              top: bandTop,
              transform: `translateY(${distance * itemHeight}px) perspective(420px) rotateX(${angle}deg)`,
              opacity,
              willChange: 'transform, opacity',
            }}
          >
            {format(valueAt(index))}
          </div>
        );
      })}
    </div>
  );
}

export default WheelPicker;
