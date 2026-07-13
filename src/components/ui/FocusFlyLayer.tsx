'use client';

import React, { useEffect } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import Fly from '@/components/ui/fly';

// The one drift choreography every focus surface uses (timer sheet + home
// hero), so the swarms mirror each other. Px offsets from each fly's anchor;
// each path swings wide, dips toward the frog once per loop, returns to its
// anchor so the repeat is seamless.
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

/**
 * One drifting fly. Pausing freezes it exactly where it is (`controls.stop`),
 * and resuming continues from the frozen spot (leading `null` keyframe = start
 * from current value) — no snap back to the anchor. Ignores the global
 * slide/sheet Rive pause by design.
 */
export function DriftFly({
  drift,
  running,
  size = 34,
  hidden = false,
  entryFromX = 0,
  flyRef,
}: {
  drift: FocusDrift;
  running: boolean;
  size?: number;
  hidden?: boolean;
  /** Respawn entry: start this many px off to the side (fully off-screen)
   *  and glide in to join the drift loop — like the welcome-page fly. */
  entryFromX?: number;
  flyRef?: (el: HTMLElement | null) => void;
}) {
  const controls = useAnimationControls();

  // Two-phase: a one-shot glide to the anchor (covers both the off-screen
  // entry and resuming from a mid-path freeze), then the infinite loop over
  // EXPLICIT keyframes. The loop must never contain a `null`/entry frame —
  // framer repeats from the resolved first keyframe, so anything dynamic in
  // frame 0 replays every cycle (flies re-entering from off-screen forever).
  useEffect(() => {
    let cancelled = false;
    if (running) {
      void (async () => {
        await controls.start({
          x: drift.x[0],
          y: drift.y[0],
          opacity: 1,
          transition: { duration: 0.9, ease: 'easeOut' },
        });
        if (cancelled) return;
        await controls.start({
          x: [...drift.x],
          y: [...drift.y],
          transition: {
            x: { duration: drift.duration, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: drift.duration, repeat: Infinity, ease: 'easeInOut' },
          },
        });
      })();
    } else {
      controls.stop();
      void controls.start({ opacity: 0.7, transition: { duration: 0.3 } });
    }
    return () => {
      cancelled = true;
    };
  }, [running, controls, drift]);

  return (
    <motion.span
      ref={flyRef}
      className="absolute"
      style={{
        ...drift.anchor,
        visibility: hidden ? 'hidden' : 'visible',
      }}
      initial={{ opacity: entryFromX ? 1 : 0, x: entryFromX, y: drift.y[0] }}
      animate={controls}
    >
      <Fly size={size} interactive={false} alwaysPlay paused={!running} />
    </motion.span>
  );
}
