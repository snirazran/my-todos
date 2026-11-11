'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticTick } from '@/lib/haptics';

const DECAY_PER_MS = 0.997;
const FRAME_MS = 16;
const FLICK_THRESHOLD = 0.12;
const SNAP_MS = 260;
const GLIDE_MAX_MS = 1100;
const MAX_VELOCITY = 2;
const VELOCITY_WINDOW_MS = 100;
const TAP_SLOP_PX = 6;
const TAP_MS = 350;
const TYPE_RESET_MS = 900;

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
  /** How much faces shrink one row away from the band (0 = none). */
  shrink?: number;
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
  shrink = 0,
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
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const downRef = useRef({ y: 0, at: 0, moved: 0 });
  const travelRef = useRef(0);
  const samplesRef = useRef<Array<{ at: number; travel: number }>>([]);
  const typedRef = useRef({ text: '', at: 0 });
  const emittedRef = useRef(value);
  const silentRef = useRef(false);
  const snapRef = useRef<{
    from: number;
    to: number;
    start: number;
    duration: number;
  } | null>(null);

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
      if (silentRef.current) return;
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
    silentRef.current = false;
  }, []);

  const glideTo = useCallback(
    (target: number, duration?: number) => {
      const to = loop ? target : Math.max(0, Math.min(count - 1, target));
      const from = offsetRef.current;
      snapRef.current = {
        from,
        to,
        start: performance.now(),
        duration:
          duration ?? Math.min(520, SNAP_MS + Math.abs(to - from) * 18),
      };
      const frame = (now: number) => {
        const snap = snapRef.current;
        if (!snap) {
          rafRef.current = 0;
          return;
        }
        const t = Math.min(1, Math.max(0, (now - snap.start) / snap.duration));
        offsetRef.current = snap.from + (snap.to - snap.from) * easeOutCubic(t);
        emitFor(offsetRef.current);
        if (t >= 1) {
          offsetRef.current = wrap(snap.to);
          snapRef.current = null;
          rafRef.current = 0;
          silentRef.current = false;
          paint();
          return;
        }
        paint();
        rafRef.current = requestAnimationFrame(frame);
      };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(frame);
    },
    [count, emitFor, loop, paint, wrap],
  );

  const targetForIndex = useCallback(
    (index: number) => {
      const current = offsetRef.current;
      if (!loop) return index;
      const direct = index - wrap(current);
      const shortest =
        direct > count / 2
          ? direct - count
          : direct < -count / 2
            ? direct + count
            : direct;
      return current + shortest;
    },
    [count, loop, wrap],
  );

  // An outside change (a preset tap) animates to its detent instead of
  // teleporting, unless the wheel is the thing that reported it.
  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    const index = values.indexOf(value);
    if (index < 0) return;
    stop();
    silentRef.current = true;
    glideTo(targetForIndex(index));
  }, [value, values, stop, glideTo, targetForIndex]);

  useEffect(() => () => stop(), [stop]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    stop();
    draggingRef.current = true;
    lastYRef.current = event.clientY;
    const now = performance.now();
    downRef.current = { y: event.clientY, at: now, moved: 0 };
    travelRef.current = 0;
    samplesRef.current = [{ at: now, travel: 0 }];
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const dy = event.clientY - lastYRef.current;
    lastYRef.current = event.clientY;
    downRef.current.moved = Math.max(
      downRef.current.moved,
      Math.abs(event.clientY - downRef.current.y),
    );

    const deltaItems = -dy / itemHeight;
    offsetRef.current = wrap(offsetRef.current + deltaItems);
    travelRef.current += deltaItems;
    const samples = samplesRef.current;
    samples.push({ at: now, travel: travelRef.current });
    while (samples.length > 2 && now - samples[0].at > VELOCITY_WINDOW_MS) {
      samples.shift();
    }
    emitFor(offsetRef.current);
    paint();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone; the glide below is what matters.
    }
    const now = performance.now();
    const down = downRef.current;
    const nearest = Math.round(offsetRef.current);

    if (
      event.type === 'pointerup' &&
      down.moved < TAP_SLOP_PX &&
      now - down.at < TAP_MS
    ) {
      const rect = event.currentTarget.getBoundingClientRect();
      const rows = Math.round(
        (event.clientY - rect.top - rect.height / 2) / itemHeight,
      );
      glideTo(nearest + rows);
      return;
    }

    const samples = samplesRef.current;
    const first = samples[0];
    const last = samples[samples.length - 1];
    let velocity = 0;
    if (samples.length >= 2 && now - last.at < 80 && last.at > first.at) {
      velocity =
        ((last.travel - first.travel) / (last.at - first.at)) * FRAME_MS;
    }
    velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));

    if (Math.abs(velocity) < FLICK_THRESHOLD) {
      glideTo(nearest, SNAP_MS);
      return;
    }
    const coast = velocity / (1 - Math.pow(DECAY_PER_MS, FRAME_MS));
    const target = Math.round(offsetRef.current + coast);
    glideTo(
      target,
      Math.min(
        GLIDE_MAX_MS,
        SNAP_MS + Math.abs(target - offsetRef.current) * 55,
      ),
    );
  };

  const step = (delta: number) => {
    stop();
    glideTo(Math.round(offsetRef.current) + delta, SNAP_MS);
  };

  const typeDigit = (digit: string) => {
    const now = performance.now();
    const typed = typedRef.current;
    let text = now - typed.at < TYPE_RESET_MS ? typed.text + digit : digit;
    let index = values.indexOf(Number(text));
    if (index < 0 && text.length > 1) {
      text = digit;
      index = values.indexOf(Number(text));
    }
    typedRef.current = { text, at: now };
    if (index < 0) return;
    stop();
    glideTo(targetForIndex(index));
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    stop();
    offsetRef.current = wrap(offsetRef.current + event.deltaY / itemHeight);
    emitFor(offsetRef.current);
    paint();
    glideTo(Math.round(offsetRef.current), SNAP_MS);
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
        } else if (/^\d$/.test(event.key)) {
          event.preventDefault();
          typeDigit(event.key);
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
        const scale = 1 - Math.min(1, Math.abs(distance)) * shrink;
        return (
          <div
            key={`face-${index}`}
            className={`absolute inset-x-0 flex items-center justify-center tabular-nums transition-colors ${
              isCurrent ? selectedClassName : itemClassName
            }`}
            style={{
              height: itemHeight,
              top: bandTop,
              transform: `translateY(${distance * itemHeight}px) perspective(420px) rotateX(${angle}deg) scale(${scale})`,
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
