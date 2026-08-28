'use client';

import { motion } from 'framer-motion';
import type { AnchorRect } from '@/lib/hints/useAnchorTracker';

export type SpotlightHole = AnchorRect & { radius?: number };

const HOLE_PAD = 8;
const DEFAULT_RADIUS = 18;
const OVERSHOOT = 2000;

export function radiusValue(raw?: string) {
  if (!raw) return DEFAULT_RADIUS;
  const first = parseFloat(raw);
  return Number.isFinite(first) ? Math.min(32, Math.max(6, first)) : DEFAULT_RADIUS;
}

/**
 * Cutouts are punched as counter-clockwise subpaths of one clockwise outer
 * rect, so two that overlap wind back to filled — stacked task rows grew a
 * dark bar between them. Overlapping holes become one rect instead.
 */
function mergeHoles(holes: SpotlightHole[]): SpotlightHole[] {
  const merged = holes.map((hole) => ({ ...hole }));
  let joined = true;
  while (joined) {
    joined = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];
        const gap = HOLE_PAD * 2 + 2;
        const apart =
          a.left > b.left + b.width + gap ||
          b.left > a.left + a.width + gap ||
          a.top > b.top + b.height + gap ||
          b.top > a.top + a.height + gap;
        if (apart) continue;
        const left = Math.min(a.left, b.left);
        const top = Math.min(a.top, b.top);
        merged[i] = {
          left,
          top,
          width: Math.max(a.left + a.width, b.left + b.width) - left,
          height: Math.max(a.top + a.height, b.top + b.height) - top,
          radius: Math.max(a.radius ?? DEFAULT_RADIUS, b.radius ?? DEFAULT_RADIUS),
        };
        merged.splice(j, 1);
        joined = true;
        break outer;
      }
    }
  }
  return merged;
}

function holeSubpath(hole: SpotlightHole) {
  const x = hole.left - HOLE_PAD;
  const y = hole.top - HOLE_PAD;
  const w = hole.width + HOLE_PAD * 2;
  const h = hole.height + HOLE_PAD * 2;
  if (w <= 0 || h <= 0) return '';
  const r = Math.min(hole.radius ?? DEFAULT_RADIUS, w / 2, h / 2);
  return [
    `M${x + r} ${y}`,
    `A${r} ${r} 0 0 0 ${x} ${y + r}`,
    `L${x} ${y + h - r}`,
    `A${r} ${r} 0 0 0 ${x + r} ${y + h}`,
    `L${x + w - r} ${y + h}`,
    `A${r} ${r} 0 0 0 ${x + w} ${y + h - r}`,
    `L${x + w} ${y + r}`,
    `A${r} ${r} 0 0 0 ${x + w - r} ${y}`,
    'Z',
  ].join(' ');
}

export default function TourSpotlight({
  holes,
  blocking,
  viewport,
  onBlockedPress,
}: {
  holes: SpotlightHole[];
  blocking: boolean;
  viewport: { width: number; height: number };
  onBlockedPress?: () => void;
}) {
  // Overshot well past the viewport on every side: a fixed element can be
  // taller than window.innerHeight (the URL bar's large/small viewport split),
  // and an outer rect measured from the window left that strip — the bottom
  // nav — undimmed and still clickable.
  const far = OVERSHOOT;
  const right = viewport.width + far;
  const bottom = viewport.height + far;
  const outer = `M${-far} ${-far} L${right} ${-far} L${right} ${bottom} L${-far} ${bottom} Z`;
  const cutouts = mergeHoles(holes).map(holeSubpath).join(' ');

  return (
    <motion.div
      aria-hidden
      data-tour-scrim
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onPointerDown={
        blocking
          ? (event) => {
              event.preventDefault();
              onBlockedPress?.();
            }
          : undefined
      }
      className={`tour-scrim fixed inset-0 z-[1998] ${
        blocking ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{
        clipPath: `path("${outer} ${cutouts}")`,
        WebkitClipPath: `path("${outer} ${cutouts}")`,
      } as React.CSSProperties}
    />
  );
}
