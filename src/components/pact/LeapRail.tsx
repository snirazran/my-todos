'use client';

import { Fragment, useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The ladder as a row of lily pads with a hop trail between them.
 *
 * Every stop is the shipped pad artwork rather than shapes drawn here: a
 * bespoke illustration in one component is a thing nobody else can maintain,
 * and a hand-drawn pad next to real artwork reads as home-made. The rest is the
 * app's existing vocabulary — the dark badge that labels a tile, the amber that
 * means earned — so the rail sits beside the reward tiles above it without
 * looking like a different product.
 *
 * Colour carries one meaning each: amber is progress and prize, neutral is
 * position, pond green is distance still to cross.
 */

export const LILY_PLAIN = '/icons/lily-plain.png';

/**
 * The pads escalate in material as the ladder climbs — plain, then bronze,
 * silver, gold, and the jewelled pad at the crossing. The rung you are standing
 * on and the one you are climbing toward are told apart by the metal itself, so
 * the rail says "this gets more precious" before a single number is read.
 */
export const LILY_LADDER_ART = [
  '/icons/lily-plain.png',
  '/icons/lily-bronze.png',
  '/icons/lily-silver.png',
  '/icons/lily-gold.png',
  '/icons/lily-emerald.png',
  '/icons/lily-diamond.png',
];

export type LeapStop = {
  /** Label under the pad — "Now", "4 wk". */
  label: string;
  /** Rate the pad pays. The destination shows a trophy instead. */
  rate?: string;
  state: 'reached' | 'next' | 'locked';
  /** The final pad: what the whole crossing is for. */
  isDestination?: boolean;
  /** Artwork for this pad. Falls back to the plain one. */
  art?: string;
  /** The pad the user is standing on right now. */
  isHere?: boolean;
};

const DOTS_PER_GAP = 5;
/** Height of the trail box. Its bottom edge sits on the pad's centre line. */
const TRAIL_H = 26;

/**
 * The hop between two pads, drawn as a dotted arc the way a route is drawn on
 * a map. A straight line between two pads reads as a bridge, and a bridge is
 * not a leap.
 *
 * Positioned HTML dots rather than an SVG path: the gaps are flex-sized, so an
 * SVG stretched to fill one squashes its own stroke and turns round dots into
 * ellipses. A dot placed by percentage stays a dot at every width.
 */
function HopTrail({ filled }: { filled: number }) {
  return (
    <div className="relative h-[26px] flex-1">
      {Array.from({ length: DOTS_PER_GAP }, (_, index) => {
        // Quadratic from pad centre to pad centre, peaking halfway up. Its x
        // works out to exactly t, so the dots space evenly across the gap.
        const t = (index + 0.5) / DOTS_PER_GAP;
        const y = 1 - 2 * t + 2 * t * t;
        // Dots swell toward the top of the arc. A leap is fastest and highest
        // in the middle, and an evenly-weighted dotted line reads as a dashed
        // border — the taper is what makes it a trajectory.
        const size = 3 + (1 - y) * 3.5;
        const landed = index < filled;
        return (
          <span
            key={index}
            style={{
              left: `${t * 100}%`,
              top: `${y * TRAIL_H}px`,
              width: `${size}px`,
              height: `${size}px`,
            }}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500',
              // Pond green for water yet to be crossed, warm gold for the part
              // already behind you — the two colours the rest of the feature
              // already runs on.
              landed
                ? 'bg-amber-400 shadow-[0_0_4px_rgba(245,179,1,0.55)]'
                : 'bg-[#6FBF5F]/45',
            )}
          />
        );
      })}
    </div>
  );
}

function Pad({ stop }: { stop: LeapStop }) {
  const [broken, setBroken] = useState(false);
  const next = stop.state === 'next';
  // Everything past the one you are climbing toward recedes a little — but
  // never the destination, which is the whole reason to look at the rail.
  const ahead = stop.state === 'locked' && !stop.isDestination;
  const src = broken ? LILY_PLAIN : (stop.art ?? LILY_PLAIN);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      // A tier pad whose art has not been drawn yet falls back to the plain one
      // rather than showing a broken image in the middle of the ladder.
      onError={() => setBroken(true)}
      className={cn(
        'select-none object-contain transition',
        // The finish line is the most valuable stop on the rail and used to be
        // the least emphasised thing on it. It gets the extra size.
        stop.isDestination ? 'h-11 w-16' : 'h-9 w-14',
        // Only slightly. Enough to put the far stops behind the near ones, not
        // enough to throw away the metal that says what a rung is worth.
        //
        // Lower on dark, for the same apparent recession. Opacity composites
        // toward whatever is behind it: on a white card it washes a pad out,
        // on a dark one it only dims a mid-toned green that was already close
        // to the surface. One number cannot fade equally against both grounds.
        ahead && 'opacity-75 dark:opacity-55',
        // The pads are wide ellipses, so a circular ring cannot hug one. A glow
        // marks the target without fighting the silhouette.
        //
        // Two glows, because one colour cannot do both grounds: a bright amber
        // that reads as light against a dark card washes out to nothing against
        // a white one, where the halo has to be DARKER than the surface to be
        // seen at all.
        next &&
          'drop-shadow-[0_0_5px_rgba(202,138,4,0.9)] dark:drop-shadow-[0_0_6px_rgba(245,179,1,0.95)]',
      )}
    />
  );
}

export function LeapRail({
  stops,
  /** How far into the leap toward the next pad the user stands, 0–1. */
  progress,
  className,
}: {
  stops: LeapStop[];
  progress: number;
  className?: string;
}) {
  if (stops.length === 0) return null;
  const nextIndex = stops.findIndex((stop) => stop.state === 'next');

  return (
    <div className={cn('flex items-start', className)}>
      {stops.map((stop, index) => {
        const locked = stop.state === 'locked';
        // The trail into this pad: full once you are standing on it, partial
        // while the leap is in the air, empty beyond.
        const filled =
          stop.state === 'reached'
            ? DOTS_PER_GAP
            : index === nextIndex
              ? Math.round(Math.min(1, Math.max(0, progress)) * DOTS_PER_GAP)
              : 0;

        return (
          <Fragment key={stop.label}>
            {index > 0 && <HopTrail filled={filled} />}
            <div
              className={cn(
                'flex shrink-0 flex-col items-center',
                stop.isDestination ? 'w-16' : 'w-14',
              )}
            >
              {/* Fixed height, bottom aligned: the destination pad is larger
                  than the rest, and letting it grow the column pushed its badge
                  and label off the row's baseline. Growing upward from a shared
                  waterline keeps every label on one line and reads as the
                  bigger pad sitting in the same pond. */}
              <div className="flex h-11 items-end">
                <div className="relative">
                  <Pad stop={stop} />
                  {/* You are here. Without it the only marked pad is the
                      target, which a first-time reader takes for their own
                      position and then reads the whole rail one stop out.
                      Placeholder until the frog token is drawn — he belongs on
                      this pad. */}
                  {/* Neutral, not amber. Amber already means "earned or worth
                      earning" everywhere else on this card — flame, covered
                      trail, the prize at the end — and a marker that borrows
                      the reward colour reads as a reward. A position is not a
                      prize, so it gets its own form and a neutral tone. */}
                  {stop.isHere && (
                    <span
                      aria-label="You are here"
                      className="absolute -top-[7px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground/70"
                    />
                  )}
                </div>
              </div>
              {/* Sits below the pad rather than over it. Overlapping covered
                  the extruded side wall, which is the only thing giving the
                  artwork its depth — the badge was flattening the pad it
                  labelled. */}
              <span
                className={cn(
                  'mt-1 grid h-[15px] min-w-[15px] place-items-center rounded-md border px-1.5 text-[9px] font-black leading-none tabular-nums shadow-sm',
                  stop.isDestination
                    ? 'border-amber-300/40 bg-amber-500 text-amber-950'
                    : locked
                      ? 'border-white/10 bg-black/45 text-white'
                      : 'border-white/10 bg-black/75 text-white',
                )}
              >
                {stop.isDestination ? (
                  <Trophy className="h-3 w-3" strokeWidth={2.75} />
                ) : (
                  // Optically centred, not geometrically. The line box already
                  // sits dead centre, but "×1.25" has no descenders, so its ink
                  // occupies only the upper half of that box and reads high.
                  // The nudge is on the text alone — the trophy is a symmetric
                  // glyph and is already where it should be.
                  <span className="translate-y-[0.5px]">{stop.rate}</span>
                )}
              </span>
              <span
                className={cn(
                  'mt-1 text-[9.5px] font-black uppercase tracking-wider tabular-nums',
                  stop.isDestination
                    ? 'text-amber-600 dark:text-amber-400'
                    : locked
                      ? 'text-muted-foreground/60'
                      : 'text-foreground',
                )}
              >
                {stop.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
