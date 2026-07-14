'use client';

import React, { useEffect, useRef } from 'react';
import Fly from '@/components/ui/fly';
import { driftElapsedMs } from '@/lib/focusDriftClock';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';

// The one drift choreography every focus surface uses (timer sheet, home
// hero, wardrobe, friends), so the swarms mirror each other. Px offsets from
// each fly's anchor; each path swings wide, dips toward the frog once per
// loop, returns to its anchor so the repeat is seamless.
export const FOCUS_DRIFTS = [
  {
    anchor: { left: '12%', top: 18 },
    x: [0, 70, 30, 110, 46, 0],
    y: [0, 26, 64, 30, 8, 0],
    duration: 13,
  },
  {
    anchor: { left: '58%', top: 6 },
    x: [0, -60, 20, -100, -30, 0],
    y: [0, 40, 70, 24, 52, 0],
    duration: 16,
  },
  {
    anchor: { left: '82%', top: 34 },
    x: [0, -90, -40, -130, -60, 0],
    y: [0, 20, 56, 40, 4, 0],
    duration: 19,
  },
  {
    anchor: { left: '32%', top: 44 },
    x: [0, 90, 140, 60, 20, 0],
    y: [0, -18, 20, 48, 10, 0],
    duration: 15,
  },
  {
    anchor: { left: '70%', top: 52 },
    x: [0, -50, -110, -30, 30, 0],
    y: [0, -24, 12, 40, -8, 0],
    duration: 17,
  },
] as const;

export type FocusDrift = (typeof FOCUS_DRIFTS)[number];

const ENTRY_MS = 900;
// A session is "just starting" for this long after the drift clock begins —
// the only remount window that plays the slide-in entry.
const FRESH_START_MS = 1500;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Piecewise keyframe interpolation with per-segment easing — the same shape
// the framer keyframe loop drew, but derived from an absolute phase.
function interp(values: readonly number[], phase: number): number {
  const segments = values.length - 1;
  const scaled = Math.min(0.9999, Math.max(0, phase)) * segments;
  const index = Math.floor(scaled);
  const local = easeInOut(scaled - index);
  return values[index] + (values[index + 1] - values[index]) * local;
}

/**
 * One drifting fly, positioned from the shared pause-aware drift clock:
 * phase = elapsed % duration. Any surface mounting at any moment (popup
 * opening, page navigation, hide/show) computes the identical position, so
 * the swarms are always in sync and never "re-enter" on a remount. Pausing
 * freezes the clock — flies hold exactly where they are.
 *
 * The rAF loop only runs while there is motion to draw: a hidden fly, a
 * paused session, or a page fly frozen by the global slide/sheet Rive pause
 * positions itself once and stops. Only in-sheet scenes pass `alwaysPlay` to
 * keep animating while the sheet holds that pause.
 *
 * The off-screen entry glide plays only when the session just started or the
 * fly is a respawn (`forceEntry`).
 */
export function DriftFly({
  drift,
  running,
  size = 34,
  hidden = false,
  entryFromX = 0,
  forceEntry = false,
  localClock = false,
  alwaysPlay = false,
  flyRef,
}: {
  drift: FocusDrift;
  running: boolean;
  size?: number;
  hidden?: boolean;
  /** Respawn/start entry: glide in from this many px to the side. */
  entryFromX?: number;
  /** Play the entry even mid-session (a respawned fly). */
  forceEntry?: boolean;
  /** Decorative scenes (a friend's frog) run on wall time instead of the
   *  shared session clock, so they animate without a session of our own. */
  localClock?: boolean;
  /** Keep animating while a sheet/scroll holds the global Rive pause — for
   *  flies rendered inside the open sheet itself. */
  alwaysPlay?: boolean;
  flyRef?: (el: HTMLElement | null) => void;
}) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const entryStartRef = useRef<number | null>(null);
  const entryDecidedRef = useRef(false);
  const pauseHeld = useRiveInteractionPause((s) => s.count > 0);
  const suspended = pauseHeld && !alwaysPlay;

  useEffect(() => {
    if (!entryDecidedRef.current) {
      entryDecidedRef.current = true;
      const doEntry =
        entryFromX !== 0 &&
        (forceEntry || localClock || driftElapsedMs() < FRESH_START_MS);
      entryStartRef.current = doEntry ? performance.now() : null;
    }
    const clock = localClock ? () => performance.now() : driftElapsedMs;

    const position = () => {
      const el = spanRef.current;
      if (!el) return;
      const durationMs = drift.duration * 1000;
      const phase = (clock() % durationMs) / durationMs;
      let x = interp(drift.x, phase);
      let y = interp(drift.y, phase);
      if (entryStartRef.current !== null) {
        const k = Math.min(
          1,
          (performance.now() - entryStartRef.current) / ENTRY_MS,
        );
        const e = easeOutCubic(k);
        x = entryFromX + (x - entryFromX) * e;
        y = y * e;
        if (k >= 1) entryStartRef.current = null;
      }
      el.style.transform = `translate(${x}px, ${y}px)`;
    };

    if (hidden) return;

    const clockLive = (localClock || running) && !suspended;
    if (!clockLive && entryStartRef.current === null) {
      position();
      return;
    }

    let raf = 0;
    const tick = () => {
      position();
      if (!clockLive && entryStartRef.current === null) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drift, entryFromX, forceEntry, localClock, running, hidden, suspended]);

  return (
    <span
      ref={(el) => {
        spanRef.current = el;
        flyRef?.(el);
      }}
      className="absolute transition-opacity duration-300"
      style={{
        ...drift.anchor,
        visibility: hidden ? 'hidden' : 'visible',
        opacity: running ? 1 : 0.7,
      }}
    >
      <Fly
        size={size}
        interactive={false}
        alwaysPlay={alwaysPlay}
        ignoreIdlePause
        paused={!running || hidden}
      />
    </span>
  );
}
