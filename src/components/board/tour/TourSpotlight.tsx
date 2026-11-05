'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { AnchorRect } from '@/lib/hints/useAnchorTracker';

export type SpotlightHole = AnchorRect & {
  key: string;
  radius?: number;
  ring?: 'strong' | 'soft';
};

const HOLE_PAD = 8;
const DEFAULT_RADIUS = 18;
const OVERSHOOT = 2000;
const DIM_BLEED = 240;
const RING_INSET = 2;
const RING_ENTER_DELAY_S = 0.24;

const HOLE_SPRING = { type: 'spring', stiffness: 420, damping: 42, mass: 1 } as const;
const HOLE_FADE = { duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const;

export function radiusValue(raw?: string) {
  if (!raw) return DEFAULT_RADIUS;
  const first = parseFloat(raw);
  return Number.isFinite(first) ? Math.min(32, Math.max(6, first)) : DEFAULT_RADIUS;
}

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
          key: a.key,
          left,
          top,
          width: Math.max(a.left + a.width, b.left + b.width) - left,
          height: Math.max(a.top + a.height, b.top + b.height) - top,
          radius: Math.max(a.radius ?? DEFAULT_RADIUS, b.radius ?? DEFAULT_RADIUS),
          ring: a.ring ?? b.ring,
        };
        merged.splice(j, 1);
        joined = true;
        break outer;
      }
    }
  }
  return merged;
}

function padded(hole: SpotlightHole) {
  const width = Math.max(0, hole.width + HOLE_PAD * 2);
  const height = Math.max(0, hole.height + HOLE_PAD * 2);
  const radius = Math.min((hole.radius ?? DEFAULT_RADIUS) + HOLE_PAD, width / 2, height / 2);
  return { x: hole.left - HOLE_PAD, y: hole.top - HOLE_PAD, width, height, radius };
}

function holeSubpath(hole: SpotlightHole) {
  const { x, y, width: w, height: h, radius } = padded(hole);
  if (w <= 0 || h <= 0) return '';
  const r = radius;
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

function geometry(hole: SpotlightHole, inset = 0) {
  const { x, y, width, height, radius } = padded(hole);
  return {
    attrX: x + inset,
    attrY: y + inset,
    width: Math.max(0, width - inset * 2),
    height: Math.max(0, height - inset * 2),
    rx: Math.max(0, radius - inset),
  };
}

export default function TourSpotlight({
  holes,
  hitHoles,
  blocking,
  viewport,
  onBlockedPress,
}: {
  holes: SpotlightHole[];
  hitHoles: SpotlightHole[];
  blocking: boolean;
  viewport: { width: number; height: number };
  onBlockedPress?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const far = OVERSHOOT;
  const right = viewport.width + far;
  const bottom = viewport.height + far;
  const outer = `M${-far} ${-far} L${right} ${-far} L${right} ${bottom} L${-far} ${bottom} Z`;
  const bleed = DIM_BLEED;
  const hitPath = `path("${outer} ${mergeHoles(hitHoles).map(holeSubpath).join(' ')}")`;
  const shown = mergeHoles(holes);
  const move = reduceMotion ? { duration: 0 } : HOLE_SPRING;
  const fade = reduceMotion ? { duration: 0.12 } : HOLE_FADE;
  const transition = {
    attrX: move,
    attrY: move,
    width: move,
    height: move,
    rx: move,
    opacity: fade,
  };

  return (
    <motion.div
      aria-hidden
      data-tour-scrim
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="pointer-events-none fixed inset-0 z-[1998]"
    >
      <svg
        className="pointer-events-none absolute overflow-visible"
        style={{
          left: -bleed,
          top: -bleed,
          width: viewport.width + bleed * 2,
          height: viewport.height + bleed * 2,
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask" maskUnits="userSpaceOnUse">
            <rect x={0} y={0} width="100%" height="100%" fill="white" />
            <g transform={`translate(${bleed} ${bleed})`}>
              <AnimatePresence initial={false}>
                {shown.map((hole) => {
                  const shape = geometry(hole);
                  return (
                    <motion.rect
                      key={hole.key}
                      fill="black"
                      initial={{ ...shape, opacity: 0 }}
                      animate={{ ...shape, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={transition}
                    />
                  );
                })}
              </AnimatePresence>
            </g>
          </mask>
        </defs>
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          mask="url(#tour-spotlight-mask)"
          className="fill-[rgba(12,20,16,0.55)] dark:fill-[rgba(0,0,0,0.7)]"
        />
        <g transform={`translate(${bleed} ${bleed})`}>
          <AnimatePresence initial={false}>
            {shown
              .filter((hole) => hole.ring)
              .map((hole) => {
                const shape = geometry(hole, RING_INSET);
                const strong = hole.ring === 'strong';
                return (
                  <motion.g
                    key={`ring-${hole.key}`}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { ...fade, delay: reduceMotion ? 0 : RING_ENTER_DELAY_S },
                    }}
                    exit={{ opacity: 0, transition: fade }}
                  >
                    {strong && (
                      <motion.rect
                        fill="none"
                        strokeWidth={10}
                        className="stroke-primary/25 dark:stroke-primary/35"
                        initial={shape}
                        animate={shape}
                        transition={transition}
                      />
                    )}
                    <motion.rect
                      fill="none"
                      strokeWidth={3}
                      className={strong ? 'stroke-primary' : 'stroke-primary/45'}
                      initial={shape}
                      animate={shape}
                      transition={transition}
                    />
                  </motion.g>
                );
              })}
          </AnimatePresence>
        </g>
      </svg>
      <div
        data-tour-scrim
        onPointerDown={
          blocking
            ? (event) => {
                event.preventDefault();
                onBlockedPress?.();
              }
            : undefined
        }
        className={`absolute inset-0 ${blocking ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{ clipPath: hitPath, WebkitClipPath: hitPath } as React.CSSProperties}
      />
    </motion.div>
  );
}
