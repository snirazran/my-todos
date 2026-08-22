'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
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

export const LILY_PLAIN = '/leap/leap-1.png';

/** The pads bloom as the ladder climbs — bare pad, bud, then flower on flower. */
export const LILY_LADDER_ART = [
  '/leap/leap-1.png',
  '/leap/leap-2.png',
  '/leap/leap-3.png',
  '/leap/leap-4.png',
  '/leap/leap-5.png',
];

/** Where each frame's drawing starts, as a fraction of the frame height. */
export const LILY_ART_TOP = [0.372, 0.344, 0.242, 0.093, 0.019];

/** The shared waterline every frame was cut against, same fraction for all. */
const LILY_ART_BOTTOM = 0.979;

/** Transparent margin either side of each frame's drawing, as a fraction. */
const LILY_ART_SIDE = [0.164, 0.164, 0.059, 0.057, 0.018];

/**
 * The pad matching a streak, by milestone rungs cleared. `inkShift` is how far
 * up the frame must move for its drawing to sit centred in its box, and
 * `sideInset` how much of the box either edge is empty.
 */
export function leapArtForStreak(cleared: number) {
  const index = Math.min(Math.max(cleared, 0), LILY_LADDER_ART.length - 1);
  return {
    src: LILY_LADDER_ART[index],
    inkShift: (LILY_ART_TOP[index] + LILY_ART_BOTTOM) / 2 - 0.5,
    sideInset: LILY_ART_SIDE[index],
  };
}

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

/**
 * Pads take a fixed SHARE OF THE RAIL, never a fixed pixel size and never a
 * share of the viewport.
 *
 * Viewport units failed because this card is not full-bleed, so `vw` sized the
 * pads against something considerably wider than the box they actually sit in.
 * A percentage of the rail is the only basis that tracks the thing the pads
 * have to fit inside.
 *
 * Five pads at 15% leave 6.25% for each of the four gaps. The columns are wider
 * than the pads look, because the artwork reserves headroom above the pad for
 * the flowers the late rungs grow — the apparent gap between two discs is close
 * to twice the number below. The cap stops it inflating inside a wide desktop
 * column; past that point the spare space goes to the gaps, which only makes
 * the leaps longer.
 *
 * Below the width where the pads hit that cap the rail stops shrinking and
 * scrolls sideways instead. Squeezing it further is what skewed it on a 320px
 * screen: the pads shrank past the point where their badges could sit under
 * them, and the trail — which lives entirely in the gaps — was the first thing
 * to be squeezed out. FLOOR_GAP is the gap the rail resolves to at the width
 * that reads best, so the geometry a 500px screen gets is the geometry every
 * narrower screen gets, just panned.
 */
const PAD_COL = '15%';
const FLOOR_PAD = 70;
const FLOOR_GAP = 44;
const PAD_COL_MAX = `${FLOOR_PAD}px`;
/** How much wider the destination pad is drawn than its column, and the bleed
 *  either side that keeps it centred. Insets rather than a translate, so the
 *  tilt below is the only transform on the artwork. */
const DEST_SCALE = '116%';
const DEST_BLEED = '-8%';

/**
 * A per-pad turn, so the row reads as five lily pads floating on water rather
 * than one asset stamped five times. Fixed angles keyed by position, not random
 * ones: the rail must not re-arrange itself between renders.
 *
 * `spin` is a rotateY under perspective, so the pad turns about its own
 * vertical axis and its notch swings to face somewhere else; `tilt` is a small
 * in-plane lean on top, for the drift a floating thing has. Both stay gentle,
 * because a hard turn shears an upright bloom sideways.
 */
const PAD_TURN = [
  { spin: -9, tilt: -3 },
  { spin: 10, tilt: 2.5 },
  { spin: -6, tilt: -3.5 },
  { spin: 8, tilt: 3 },
  { spin: -11, tilt: -2 },
  { spin: 7, tilt: 3 },
];
/** Close enough to exaggerate the turn at this pad size; further away and a
 *  rotateY just flattens the artwork instead of turning it. */
const PAD_PERSPECTIVE = '220px';

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
    // Stretched to the pad row, then the arc is drawn above the waterline only,
    // so the trail's bottom edge lands on the pads' own centre line whatever
    // height the pads have resolved to. Percentages against a stretched box
    // resolve reliably; a percentage height on the flex item itself would not,
    // because the row's height comes from its content. It ends 32% up rather
    // than half way because the cell reserves its top third for flowers.
    <div className="relative flex-1 self-stretch">
      <div className="absolute inset-x-0 bottom-[32%] top-0">
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
            // Vertical position as a percentage of the box, not pixels: the box
            // is now fluid, and a px offset would drift off the pad centre at
            // every width but one.
            style={{
              left: `${t * 100}%`,
              top: `${y * 100}%`,
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
    </div>
  );
}

function Pad({
  stop,
  turn,
}: {
  stop: LeapStop;
  turn: (typeof PAD_TURN)[number];
}) {
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
      // Absolutely positioned so the cell's height comes from its aspect ratio
      // alone. The destination is drawn wider than its column and overflows
      // upward from the shared waterline — if it grew the cell instead, its
      // badge and label would drop off the row's baseline.
      //
      // The destination is placed with insets rather than a translate for the
      // same reason: `transform` here belongs to the turn alone, and a
      // centring translate would have had to be folded into every pad's matrix.
      style={{
        transform: `perspective(${PAD_PERSPECTIVE}) rotateY(${turn.spin}deg) rotateZ(${turn.tilt}deg)`,
        ...(stop.isDestination
          ? { left: DEST_BLEED, width: DEST_SCALE }
          : { width: '100%', height: '100%' }),
      }}
      className={cn(
        'select-none object-contain transition',
        stop.isDestination
          ? 'absolute bottom-0 h-auto'
          : 'absolute inset-0',
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
        // Softer on dark than on light. Against a dark card the neighbouring
        // pads are already dimmed, so contrast is doing most of the work and
        // the halo only has to confirm it; against white nothing else separates
        // the target, so the glow has to carry it alone.
        next &&
          'drop-shadow-[0_0_5px_rgba(202,138,4,0.9)] dark:drop-shadow-[0_0_4px_rgba(245,179,1,0.5)]',
      )}
    />
  );
}

/**
 * Which end of the rail has more to show, and a mouse fallback for reaching it.
 *
 * Touch already pans this natively, and a trackpad throws horizontal deltas at
 * it, but a plain wheel mouse has no way to scroll a hidden-scrollbar row at
 * all — so a mouse drag moves it. Only a mouse: intercepting touch would trade
 * the platform's momentum and rubber-banding for a worse hand-rolled version.
 */
function useRailScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A pixel of slack: fractional layout widths mean scrollLeft never lands
    // exactly on the maximum, and a fade that can never fully clear reads as a
    // rendering fault rather than an affordance.
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    const el = ref.current;
    if (!el || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    // Without this the browser starts its own gesture on mousedown — a text
    // selection over the labels, or an image drag off a pad — and that gesture
    // owns the pointer for the rest of the stroke, so the rail never moves.
    // Cancelling the default before it begins is what makes the drag the only
    // thing happening.
    event.preventDefault();
    const originX = event.clientX;
    const originScroll = el.scrollLeft;
    const drag = (move: PointerEvent) => {
      el.scrollLeft = originScroll - (move.clientX - originX);
    };
    const release = () => {
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }, []);

  return { ref, edges, onPointerDown };
}

/**
 * The one thing that says the rail continues past the card edge. It sits on the
 * card's own colour so the pads dissolve into the surface instead of being cut
 * off by it — a hard edge reads as a layout bug, a soft one reads as more.
 */
function EdgeFade({ side, shown }: { side: 'left' | 'right'; shown: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Matched to the scroller's box, which starts above this one — the
        // "you are here" marker lives in that overhang and has to fade with
        // everything else.
        //
        // Fading to `card/0` rather than `transparent`: transparent is
        // transparent BLACK, and a ramp through it lays a grey haze over a
        // light card. The same colour at zero alpha ramps to nothing at all.
        'pointer-events-none absolute -top-3 bottom-0 z-10 w-7 transition-opacity duration-200',
        side === 'left'
          ? '-left-1 bg-gradient-to-r from-card to-card/0'
          : '-right-1 bg-gradient-to-l from-card to-card/0',
        shown ? 'opacity-100' : 'opacity-0',
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
  const { ref, edges, onPointerDown } = useRailScroll();

  if (stops.length === 0) return null;
  const nextIndex = stops.findIndex((stop) => stop.state === 'next');

  const cell = { width: PAD_COL, maxWidth: PAD_COL_MAX };
  const railFloor = stops.length * FLOOR_PAD + (stops.length - 1) * FLOOR_GAP;
  const filledInto = (index: number) =>
    stops[index].state === 'reached'
      ? DOTS_PER_GAP
      : index === nextIndex
        ? Math.round(Math.min(1, Math.max(0, progress)) * DOTS_PER_GAP)
        : 0;

  return (
    // Two rows sharing one set of column widths, rather than one row of stacked
    // columns. The trail has to know how tall the pads are so it can end on
    // their centre line, and inside a single column that height is polluted by
    // the badge and label sitting underneath. Split, the pad row's height is
    // the pads and nothing else, and the label row lines up because both rows
    // are built from the same percentages.
    // The scroller carries the padding the "you are here" marker and the target
    // pad's glow need: an overflow-x scroller clips vertically too, and both of
    // those live outside the pad row's own box.
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        className={cn(
          '-mx-1 -mt-3 select-none overflow-x-auto overscroll-x-contain px-1 pb-0.5 pt-3 [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          (edges.start || edges.end) && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div style={{ minWidth: `${railFloor}px` }}>
          <div className="flex items-end">
            {stops.map((stop, index) => (
              <Fragment key={stop.label}>
                {index > 0 && <HopTrail filled={filledInto(index)} />}
                {/* Aspect ratio, not a height: the cell's height follows its
                    own width, so every pad keeps the artwork's proportions at
                    any rail width and all five cells stay exactly as tall as
                    each other. The art is cut on a shared waterline, so equal
                    cells put every disc on the same line. */}
                <div className="relative aspect-[500/430] shrink-0" style={cell}>
                  <Pad stop={stop} turn={PAD_TURN[index % PAD_TURN.length]} />
                  {/* You are here. Without it the only marked pad is the
                      target, which a first-time reader takes for their own
                      position and then reads the whole rail one stop out.
                      Placeholder until the frog token is drawn — he belongs on
                      this pad. Offset from where the pad's own art begins, so
                      it hangs level over a bare pad and a flowering one.

                      Neutral, not amber: amber already means "earned or worth
                      earning" everywhere else on this card, and a marker that
                      borrows the reward colour reads as a reward. A position is
                      not a prize. */}
                  {stop.isHere && (
                    <span
                      aria-label="You are here"
                      style={{
                        top: `calc(${
                          (LILY_ART_TOP[
                            Math.max(0, LILY_LADDER_ART.indexOf(stop.art ?? ''))
                          ] ?? 0) * 100
                        }% - 8px)`,
                      }}
                      className="absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground/70"
                    />
                  )}
                </div>
              </Fragment>
            ))}
          </div>

          <div className="mt-1 flex">
            {stops.map((stop, index) => {
              const locked = stop.state === 'locked';
              return (
                <Fragment key={stop.label}>
                  {index > 0 && <span className="flex-1" />}
                  <span
                    className="flex shrink-0 flex-col items-center"
                    style={cell}
                  >
                    {/* Below the pad rather than over it. Overlapping covered
                        the extruded side wall, which is the only thing giving
                        the artwork its depth — the badge was flattening the pad
                        it labelled. */}
                    <span
                      className={cn(
                        'grid h-[15px] min-w-[15px] place-items-center rounded-md border px-1.5 text-[9px] font-black leading-none tabular-nums shadow-sm',
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
                        // Optically centred, not geometrically. The line box
                        // sits dead centre already, but "×1.25" has no
                        // descenders, so its ink occupies only the upper half of
                        // that box and reads high. The nudge is on the text
                        // alone — the trophy is symmetric and is already where
                        // it should be.
                        <span className="translate-y-[0.5px]">{stop.rate}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'mt-1 text-[11px] font-black tabular-nums',
                        stop.isDestination
                          ? 'text-amber-600 dark:text-amber-400'
                          : locked
                            ? 'text-muted-foreground/60'
                            : 'text-foreground',
                      )}
                    >
                      {stop.label}
                    </span>
                  </span>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <EdgeFade side="left" shown={edges.start} />
      <EdgeFade side="right" shown={edges.end} />
    </div>
  );
}