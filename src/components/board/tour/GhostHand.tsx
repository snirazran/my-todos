'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { AnchorRect } from '@/lib/hints/useAnchorTracker';

const CYCLE_S = 2.8;
const DOT = 28;

function centerOf(rect: AnchorRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export default function GhostHand({
  from,
  to,
}: {
  from: AnchorRect;
  to: AnchorRect | null;
}) {
  const reduceMotion = useReducedMotion();
  const a = centerOf(from);
  const b = to ? centerOf(to) : null;

  if (!b) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bow = Math.min(56, Math.max(18, Math.hypot(dx, dy) * 0.18));
  const midX = a.x + dx / 2 + (dy === 0 ? 0 : -dy / Math.hypot(dx, dy)) * bow;
  const midY = a.y + dy / 2 - bow;

  const half = DOT / 2;
  // Looping keyframe arrays are captured when the animation starts, so a rect
  // that moves afterwards leaves the fingertip running the old path until
  // something remounts it. Keying on the geometry restarts it in place.
  const pathKey = `${Math.round(a.x)},${Math.round(a.y)},${Math.round(
    b.x,
  )},${Math.round(b.y)}`;

  return (
    <div className="pointer-events-none fixed inset-0 z-[2001]" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" fill="none">
        <path
          d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`}
          stroke="currentColor"
          className="text-primary/40"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="2 10"
        />
      </svg>

      {reduceMotion ? (
        <span
          className="absolute rounded-full border-[3px] border-primary bg-primary/25"
          style={{ left: b.x - half, top: b.y - half, width: DOT, height: DOT }}
        />
      ) : (
        <>
        <motion.span
          key={`ripple-${pathKey}`}
          className="absolute rounded-full border-2 border-primary"
          style={{
            left: a.x - half,
            top: a.y - half,
            width: DOT,
            height: DOT,
          }}
          animate={{ scale: [0.6, 1.7, 1.7], opacity: [0, 0.8, 0] }}
          transition={{
            duration: CYCLE_S,
            times: [0, 0.26, 0.42],
            ease: 'easeOut',
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        />
        <motion.span
          key={`dot-${pathKey}`}
          className="absolute rounded-full border-[3px] border-primary bg-primary/30 shadow-lg shadow-primary/30"
          style={{ width: DOT, height: DOT }}
          initial={false}
          animate={{
            left: [
              a.x - half,
              a.x - half,
              a.x - half,
              midX - half,
              b.x - half,
              b.x - half,
              b.x - half,
            ],
            top: [
              a.y - half,
              a.y - half,
              a.y - half,
              midY - half,
              b.y - half,
              b.y - half,
              b.y - half,
            ],
            scale: [0.6, 1, 0.82, 0.82, 0.82, 1.15, 0.6],
            opacity: [0, 1, 1, 1, 1, 0.9, 0],
          }}
          transition={{
            duration: CYCLE_S,
            times: [0, 0.12, 0.3, 0.58, 0.76, 0.88, 1],
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        />
        </>
      )}
    </div>
  );
}

/** A tap ripple only reads on a small, specific target; on a whole panel it is noise. */
export const TAP_PULSE_MAX_EXTENT = 120;

export function PointerArrow({
  at,
  direction = 'up',
}: {
  at: AnchorRect;
  direction?: 'up' | 'down';
}) {
  const reduceMotion = useReducedMotion();
  const { x } = centerOf(at);
  const up = direction === 'up';
  const Chevron = up ? ChevronUp : ChevronDown;

  return (
    <div className="pointer-events-none fixed inset-0 z-[2001]" aria-hidden>
      <motion.span
        className="absolute flex flex-col items-center text-primary"
        style={{
          left: x - 12,
          top: up ? at.top + at.height + 10 : at.top - 32,
        }}
        animate={reduceMotion ? undefined : { y: up ? [0, -6, 0] : [0, 6, 0] }}
        transition={{ duration: 1.3, ease: 'easeInOut', repeat: Infinity }}
      >
        <Chevron className="h-6 w-6" strokeWidth={3.5} />
      </motion.span>
    </div>
  );
}

const HALO_PAD = 5;

/**
 * A halo that inherits the target's own border radius: a circle around a round
 * button, a pill around the date pill, a rounded rect around a task row.
 */
export function TapPulse({ at }: { at: AnchorRect & { radius?: string } }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  if (Math.min(at.width, at.height) > TAP_PULSE_MAX_EXTENT) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[2001]" aria-hidden>
      <motion.span
        className="absolute border-2 border-primary"
        style={{
          left: at.left - HALO_PAD,
          top: at.top - HALO_PAD,
          width: at.width + HALO_PAD * 2,
          height: at.height + HALO_PAD * 2,
          borderRadius: at.radius ?? '9999px',
        }}
        animate={{ scale: [1, 1.16, 1.16], opacity: [0, 0.85, 0] }}
        transition={{
          duration: 3.2,
          times: [0, 0.22, 0.5],
          ease: 'easeOut',
          repeat: Infinity,
        }}
      />
    </div>
  );
}
