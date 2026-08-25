'use client';

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Flame, Play } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import {
  RewardTile,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import type { QuestReward } from '@/lib/quests/types';
import { hapticCelebrate } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { PactView, PactWeekResult } from '@/lib/pact/types';
import { formatPactRate } from '@/lib/pact/format';
import { leapArtForStreak } from './LeapRail';

/**
 * The one moment the weekly leap never had.
 *
 * Settlement is lazy — it runs on the first page load after the week rolls
 * over — so a streak could break, a shield could be spent, and a finished
 * week's rewards could be granted, all with the card simply gone by the time
 * the user next looked. Every one of those is the payoff for something they
 * committed to; none of them should arrive as a number that quietly changed.
 *
 * A miss is reported plainly and once. No guilt, no "you let your frog down" —
 * the point is that the user learns the rule (all sessions, or no bonus), and
 * is offered the shield that would have covered it. That offer belongs here
 * because this is the only moment they have felt the cost of not having one.
 */

/** Beat before anything moves, so the sheet has finished arriving. */
const HOP_DELAY = 340;
/** Gap between one dot lighting and the next. */
const DOT_STAGGER = 90;
/** After the last dot moves, how long the pad takes to bloom. */
const LANDING_BEAT = 200;

/**
 * Where a point sits on the hop's arc, as percentages of the trail's box.
 *
 * The box is the top half of the pad's own square, so 100% is exactly the pads'
 * centre line and the arc climbs from there. Both the height and the length of
 * the arc scale with how many weeks the hop spans: a one-week hop is a low bead
 * sitting between the two pads, not a lone dot stranded at the top of a
 * full-width arc it never earned.
 */
const HERO_ARC = 0.62;
const heroSpread = (dots: number) => Math.min(1, dots * 0.4);
/** The dot at `index`, in the box's own 0–1 horizontal space. */
const dotU = (index: number, dots: number) =>
  0.5 + ((index + 0.5) / dots - 0.5) * heroSpread(dots);
const arcLeft = (u: number) => `${u * 100}%`;
const arcTop = (u: number, dots: number) =>
  `${(1 - Math.max(0, 1 - (2 * u - 1) ** 2) * HERO_ARC * heroSpread(dots)) * 100}%`;

/**
 * The bead that runs the arc ahead of the dots.
 *
 * A dot that simply changes colour is a progress bar with gaps in it. What the
 * trail is drawing is a hop, and a hop has to be seen travelling — so something
 * crosses the water, and each dot lights as it is passed.
 */
function HopBead({
  from,
  to,
  dots,
  delay,
  duration,
}: Readonly<{
  from: number;
  to: number;
  dots: number;
  delay: number;
  duration: number;
}>) {
  const u = useMotionValue(from);
  const left = useTransform(u, arcLeft);
  const top = useTransform(u, (value: number) => arcTop(value, dots));
  const [phase, setPhase] = useState<'idle' | 'flying' | 'done'>('idle');

  useEffect(() => {
    const controls = animate(u, to, {
      duration: duration / 1000,
      delay: delay / 1000,
      ease: [0.32, 0.06, 0.24, 1],
      onPlay: () => setPhase('flying'),
      onComplete: () => setPhase('done'),
    });
    return () => controls.stop();
  }, [u, to, delay, duration]);

  return (
    <motion.span
      aria-hidden="true"
      style={{ left, top }}
      className={cn(
        'pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_10px_3px_rgba(245,179,1,0.75)] transition-opacity duration-200 motion-reduce:hidden',
        phase === 'flying' ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/** Rungs cleared at a given streak, which is what picks the pad's artwork. */
function padArtFor(view: PactView, weeks: number) {
  const cleared = view.ladder.rungs.filter(
    (rung) => rung.weeks > 0 && rung.weeks <= weeks,
  ).length;
  return leapArtForStreak(cleared);
}

/** What a week pays once the streak stands at `weeks`. */
function rateFor(view: PactView, weeks: number) {
  const reached = view.ladder.rungs
    .filter((rung) => rung.weeks <= weeks)
    .sort((a, b) => b.weeks - a.weeks)[0];
  return reached?.effective ?? view.ladder.baseMultiplier;
}

const clamp = (value: number, max: number) =>
  Math.min(max, Math.max(0, value));

/**
 * Which stretch of the ladder this week happened on, and what moved along it.
 *
 * A week is not a leap. Most weeks advance the streak WITHIN a stretch — one
 * more step along the trail toward the next pad — and drawing those as a full
 * pad-to-pad hop promised a rung that was not reached, with both pads reading
 * the same rate to prove it. Only a week that actually lands on a rung gets
 * the landing.
 *
 * The dots are the weeks between the two pads and nothing else: rungs at 0 and
 * 4 are three weeks apart in the middle, so three dots, and the fourth week is
 * the pad itself.
 */
function hopModel(view: PactView, result: PactWeekResult) {
  const rungWeeks = Array.from(
    new Set([0, ...view.ladder.rungs.map((rung) => rung.weeks)]),
  ).sort((a, b) => a - b);

  const { streakBefore, streakAfter } = result;
  // A landing is the streak coming to rest exactly on a rung it was below.
  const landing =
    streakAfter > 0 &&
    streakAfter > streakBefore &&
    rungWeeks.includes(streakAfter);

  const base = landing
    ? Math.max(...rungWeeks.filter((weeks) => weeks < streakAfter))
    : Math.max(...rungWeeks.filter((weeks) => weeks <= streakAfter));
  const target =
    rungWeeks.find((weeks) => weeks > base) ?? base + Math.max(1, streakAfter - base);

  const dots = Math.max(1, target - base - 1);
  const filledBefore = clamp(streakBefore - base, dots);
  const filledAfter = landing ? dots : clamp(streakAfter - base, dots);
  // Only the dots that actually change carry a beat; a week that moves one dot
  // should not wait out a five-dot stagger before the streak counts up. The
  // floors keep a single step from being a flicker, and a landing — which
  // crosses the whole trail — from being a blur.
  const moving = Math.abs(filledAfter - filledBefore);
  const travel = Math.max(landing ? 420 : 260, moving * DOT_STAGGER);
  const settleAt = HOP_DELAY + travel + (landing ? LANDING_BEAT : 0);

  return {
    base,
    target,
    dots,
    filledBefore,
    filledAfter,
    landing,
    moving,
    travel,
    settleAt,
  };
}

/**
 * The number the whole screen is about, arriving as a movement rather than as
 * a value that was already there. A streak that simply reads "3" asks the user
 * to remember what it said last week; one that climbs from 2 shows them.
 */
function useCountUp(from: number, to: number, delay: number, duration = 620) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (from === to) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay, duration]);
  return value;
}

function HopPad({
  art,
  rate,
  caption,
  dim,
  here,
  glow,
}: {
  art: ReturnType<typeof leapArtForStreak>;
  rate: string;
  caption: string;
  dim: boolean;
  here: boolean;
  glow: boolean;
}) {
  return (
    <div className="flex w-[88px] shrink-0 flex-col items-center">
      {/* Aspect ratio rather than a height, so the artwork keeps its
          proportions and both pads sit on the same waterline. */}
      <div className="relative aspect-[500/430] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={art.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ transform: `translateY(${-art.inkShift * 100}%)` }}
          className={cn(
            'absolute inset-0 h-full w-full select-none object-contain transition-all duration-500',
            dim && 'scale-90 opacity-45 grayscale',
            glow &&
              'drop-shadow-[0_0_7px_rgba(202,138,4,0.85)] dark:drop-shadow-[0_0_6px_rgba(245,179,1,0.6)]',
          )}
        />
        {/* You are here. The marker moves rather than the pads, because the
            pads are the ladder and the ladder does not move. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-1/2 top-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-foreground/70 transition-all duration-300',
            here ? 'opacity-100' : '-translate-y-1 opacity-0',
          )}
        />
      </div>
      <span
        className={cn(
          'mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-black transition-colors duration-500',
          dim
            ? 'bg-muted text-muted-foreground/70'
            : 'bg-foreground/85 text-background',
        )}
      >
        {rate}
      </span>
      <span
        className={cn(
          'mt-1 text-[11px] font-black transition-colors duration-500',
          dim ? 'text-muted-foreground/60' : 'text-foreground',
        )}
      >
        {caption}
      </span>
    </div>
  );
}

/**
 * The week as one leap between two pads.
 *
 * A trophy said "something good happened" and nothing else. This says which
 * rung the user was standing on, which one they are standing on now, and what
 * each one pays — the three facts the rest of the sheet is explaining, drawn
 * in the same vocabulary as the ladder they will scroll back to.
 */
function LeapHop({
  view,
  hop,
}: Readonly<{
  view: PactView;
  hop: ReturnType<typeof hopModel>;
}>) {
  const [lit, setLit] = useState(hop.filledBefore);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const move = window.setTimeout(() => setLit(hop.filledAfter), HOP_DELAY);
    const land = hop.landing
      ? window.setTimeout(() => setArrived(true), hop.settleAt)
      : 0;
    return () => {
      window.clearTimeout(move);
      if (land) window.clearTimeout(land);
    };
  }, [hop.filledAfter, hop.landing, hop.settleAt]);

  const gaining = hop.filledAfter >= hop.filledBefore;

  return (
    <div className="flex items-start justify-center gap-0 pt-1">
      <HopPad
        art={padArtFor(view, hop.base)}
        rate={formatPactRate(rateFor(view, hop.base))}
        caption={hop.base === 0 ? 'Start' : `${hop.base} wk`}
        dim={arrived}
        here={!arrived}
        glow={false}
      />
      {/* As tall as the pad's art box, and the arc lives in its top half — so
          the trail's baseline IS the line the two pads are centred on. */}
      <div className="relative h-[76px] w-[72px] shrink-0">
        <div className="absolute inset-x-0 top-0 h-1/2">
          {Array.from({ length: hop.dots }, (_, index) => {
            const u = dotU(index, hop.dots);
            const rise = 1 - (2 * u - 1) ** 2;
            const size = 3.2 + rise * 3.4;
            const on = index < lit;
            // The beat belongs to the dots that move, counted from whichever
            // end the run is moving from: gained dots light away from the pad
            // behind you, lost ones go out from the front of the run back.
            const delay = gaining
              ? (hop.travel * (index + 1 - hop.filledBefore)) /
                Math.max(1, hop.moving)
              : Math.max(0, hop.filledBefore - 1 - index) * DOT_STAGGER;
            // Only a dot this week actually won gets the landing pop. The ones
            // already behind the user were lit before the sheet opened.
            const won = on && gaining && index >= hop.filledBefore;
            return (
              <span key={index}>
                {/* The splash, behind the dot and unclipped by it. */}
                {won && (
                  <span
                    aria-hidden="true"
                    style={{
                      left: arcLeft(u),
                      top: arcTop(u, hop.dots),
                      width: `${size}px`,
                      height: `${size}px`,
                      animationDelay: `${delay}ms`,
                    }}
                    className="leap-dot-ring pointer-events-none absolute rounded-full bg-amber-400/70 animate-[leap-dot-ring_520ms_ease-out_both]"
                  />
                )}
                <span
                  style={{
                    left: arcLeft(u),
                    top: arcTop(u, hop.dots),
                    width: `${size}px`,
                    height: `${size}px`,
                    transitionDelay: `${delay}ms`,
                    ...(won
                      ? { animationDelay: `${delay}ms` }
                      : null),
                  }}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300',
                    on
                      ? 'scale-100 bg-amber-400 opacity-100 shadow-[0_0_6px_rgba(245,179,1,0.7)]'
                      : 'scale-[0.72] bg-[#6FBF5F] opacity-55',
                    won &&
                      'leap-dot-land animate-[leap-dot-land_420ms_cubic-bezier(0.22,1,0.36,1)_both]',
                  )}
                />
              </span>
            );
          })}
          {gaining && (hop.moving > 0 || hop.landing) && (
            <HopBead
              // Starts on the last dot already behind the user — or on the pad
              // itself when the run is empty — and stops on the dot this week
              // won, or carries on to the far pad when the week lands a rung.
              from={dotU(hop.filledBefore - 1, hop.dots)}
              to={hop.landing ? 1 : dotU(hop.filledAfter - 1, hop.dots)}
              dots={hop.dots}
              delay={HOP_DELAY}
              duration={hop.travel}
            />
          )}
        </div>
      </div>
      <HopPad
        art={padArtFor(view, hop.target)}
        rate={formatPactRate(rateFor(view, hop.target))}
        caption={`${hop.target} wk`}
        dim={!arrived}
        here={arrived}
        glow={arrived}
      />
    </div>
  );
}

export function PactWeekResultSheet({
  view,
  result,
  onClose,
  onGetShield,
  onStartLeap,
}: {
  view: PactView;
  result: PactWeekResult;
  onClose: () => void;
  onGetShield: () => void;
  onStartLeap: () => void;
}) {
  const [open, setOpen] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  const kept = result.outcome === 'kept';
  const rescued = result.outcome === 'rescued';
  const nearMiss = result.outcome === 'near_miss';
  const missed = result.outcome === 'missed';
  const hop = hopModel(view, result);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (missed) return;
    // Fired on the landing, not on mount. Confetti thrown before the frog has
    // left the pad celebrates something the user has not been shown yet.
    const timer = window.setTimeout(() => {
      hapticCelebrate();
      confetti({
        particleCount: hop.landing ? 130 : kept ? 80 : 60,
        spread: 78,
        startVelocity: 40,
        origin: { y: 0.34 },
        zIndex: 1600,
      });
    }, hop.settleAt);
    return () => window.clearTimeout(timer);
  }, [missed, kept, hop.settleAt, hop.landing]);

  const dismiss = () => {
    setOpen(false);
    // Let the sheet's exit finish before the parent drops it from the tree.
    window.setTimeout(onClose, 260);
  };

  const streakShown = useCountUp(
    result.streakBefore,
    result.streakAfter,
    hop.settleAt,
  );

  const rewardCatalog = view.rewardCatalog as Record<
    string,
    QuestRewardCatalogItem
  >;
  // Item ids arrive without their kind, and a background rendered as a wearable
  // draws a bare frog. The catalog is the only thing that knows which is which.
  const prizes: QuestReward[] = [
    ...(result.fliesGranted > 0
      ? [{ type: 'FLIES' as const, amount: result.fliesGranted }]
      : []),
    ...(result.grantedItemIds ?? []).map((id) =>
      rewardCatalog[id]?.slot === 'background'
        ? { type: 'BACKGROUND' as const, backgroundId: id }
        : { type: 'ITEM' as const, itemId: id },
    ),
  ];

  // Where the run goes next, so the screen ends on the climb rather than on a
  // number that has stopped moving. Only ever the very next rung: a ladder of
  // distant targets reads as a chore list.
  const nextRung = view.ladder.rungs
    .filter((rung) => rung.weeks > result.streakAfter)
    .sort((a, b) => a.weeks - b.weeks)[0];
  const toGo = nextRung ? nextRung.weeks - result.streakAfter : 0;

  const weeksWord = (count: number) => `${count} week${count === 1 ? '' : 's'}`;

  // The one thing to do next, offered only when there is actually a pick to
  // make: the week that just settled is over, and this week's is unclaimed.
  // Dismissing onto a page where the user still has to find "Take the Leap"
  // spends the one moment they are most willing to commit again.
  const canStart = view.pickOpen;

  const leave = (next: () => void) => {
    setOpen(false);
    window.setTimeout(next, 260);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && dismiss()}
      zIndex={1500}
      className="max-h-[92vh] bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {({ bindScroll }) => (
        // A celebration that cannot be dismissed is not a celebration. On a
        // short screen the hop, the streak and the prizes scroll; the button
        // that closes the sheet never does.
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pt-1"
          >
            <div className="flex flex-col gap-3.5 pb-3">
              <LeapHop view={view} hop={hop} />

              <div className="text-center">
                <p className="text-[13px] font-black text-muted-foreground">
                  Your Leap · {result.categoryName}
                </p>
                <h2 className="mt-1 text-[21px] font-black leading-tight text-foreground">
                  {result.lapCompleted
                    ? result.prestigeLabel
                      ? `You earned ${result.prestigeLabel}`
                      : 'You finished the whole cycle'
                    : kept
                      ? 'You kept your word'
                      : rescued
                        ? 'A Lily Pad caught your streak'
                        : nearMiss
                          ? 'Close enough to hold'
                          : 'That week got away'}
                </h2>
                {/* Prestige has to explain itself here or nowhere: the streak
                    the user is about to see is zero, and without this screen
                    that reads as the thing they were trying to avoid. */}
                <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] font-semibold leading-snug text-muted-foreground">
                  {result.lapCompleted
                    ? `${weeksWord(result.streakAfter)} straight. The climb starts again — but every week from now pays ${formatPactRate(result.prestigeBase ?? 1)} before your streak is counted, and that never goes away.`
                    : kept
                      ? result.milestoneWeeks
                        ? `All ${result.target} session${result.target === 1 ? '' : 's'} done — and that is ${weeksWord(result.milestoneWeeks)} running.`
                        : `All ${result.target} session${result.target === 1 ? '' : 's'} done.`
                      : rescued
                        ? `You finished ${result.progress} of ${result.target}. A Lily Pad caught the rest, so the streak stands where it is.`
                        : nearMiss
                          ? `You finished ${result.progress} of ${result.target} — enough to keep the streak. It holds at ${result.streakAfter} rather than moving up, and this week's bonus and gift are gone.`
                          : `You finished ${result.progress} of ${result.target}. Sessions you did still paid — the bonus needed all of them.`}
                </p>
              </div>

              {/* The streak, stated as a change rather than a final number: what
                  the week cost or bought is the whole reason this screen exists. */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
                <span className="text-[13px] font-black text-muted-foreground">
                  Streak
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[19px] font-black tabular-nums',
                    missed
                      ? 'text-muted-foreground'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  <Icon
                    name="leap"
                    className={cn(
                      '-my-1 h-[19px] w-[19px] shrink-0',
                      missed && 'opacity-60 grayscale',
                    )}
                  />
                  {streakShown}
                </span>
              </div>

              {prizes.length > 0 && (
                // The prizes themselves, at the size the rest of the app draws
                // them. "24 collected for you" is a receipt; a tile is the thing.
                <div className="flex flex-col gap-2 rounded-2xl bg-lime-500/10 px-4 py-3">
                  <span className="text-[12px] font-black text-lime-700 dark:text-lime-400">
                    {(result.grantedItemIds?.length ?? 0) > 0
                      ? 'Collected — the prizes are in your wardrobe'
                      : 'Collected for you'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {prizes.map((reward, index) => (
                      <span
                        key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? index}`}
                        // Landing first, then the payout, one tile at a time —
                        // each prize gets its own beat instead of the row
                        // appearing as a single block of stuff.
                        className="animate-[reward-pop_0.42s_ease-out_both] motion-reduce:animate-none"
                        style={{
                          animationDelay: `${hop.settleAt + index * 110}ms`,
                        }}
                      >
                        <RewardTile
                          reward={reward}
                          rewardCatalog={rewardCatalog}
                          isPremium={view.isPremium}
                          hideBadge={reward.type !== 'FLIES'}
                          flySize={34}
                          giftAnimation={
                            reward.type === 'BOX' ? 'box_shake' : undefined
                          }
                        />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Current achievement, then the next step — never the whole ladder. */}
              {nextRung && toGo > 0 && (
                <p className="text-center text-[12.5px] font-bold text-muted-foreground">
                  {`${toGo} more Leap${toGo === 1 ? '' : 's'} and every week pays `}
                  <span className="font-black text-foreground">
                    {formatPactRate(nextRung.effective)}
                  </span>
                </p>
              )}

            </div>
          </div>

          <div className="relative flex flex-col gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
            {/* The content runs under the footer rather than stopping dead at
                it, so a scrollable sheet says so without a divider line. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-background to-transparent"
            />
            {/* Only offered where it would have helped, and only when there is
                none in hand — the cost of not having one is exactly what the
                user has just been told. */}
            {missed && result.shieldsLeft === 0 && (
              <button
                type="button"
                onClick={() => leave(onGetShield)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#3b7a38] transition-transform active:translate-y-[2px] active:shadow-none"
              >
                <Icon name="lilyPad" className="-my-1 h-[26px] w-[26px]" />
                Get a Lily Pad for next time
              </button>
            )}
            {/* One primary action, named for what it does. A shield offer
                outranks it on a missed week — it is the thing the user has
                just been shown the cost of — so there the start drops to the
                quiet row underneath. */}
            {canStart && !(missed && result.shieldsLeft === 0) && (
              <button
                type="button"
                onClick={() => leave(onStartLeap)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none"
              >
                <Play className="h-4 w-4 fill-current" strokeWidth={2.5} />
                Start this week&apos;s Leap
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                canStart && missed && result.shieldsLeft === 0
                  ? leave(onStartLeap)
                  : dismiss()
              }
              className={cn(
                'h-12 w-full rounded-2xl text-[15px] font-black transition-transform active:translate-y-[2px] active:shadow-none',
                canStart || (missed && result.shieldsLeft === 0)
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'bg-[#4f9149] text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40',
              )}
            >
              {missed
                ? canStart
                  ? 'Start this week'
                  : 'Close'
                : canStart
                  ? 'Not now'
                  : 'Nice'}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
