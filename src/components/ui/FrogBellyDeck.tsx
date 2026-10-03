'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  HUNGER_SEGMENTS,
  bellyHint,
  getHungerState,
  segmentFill,
} from '@/lib/hungerDisplay';
import { BellyPip } from './BellyPip';

const PIP_STAGGER_MS = 120;
const PIP_FILL_MS = 500;
const FEED_HOLD_MS = 2400;
const FULL_PIP = 0.999;

type Feed = { id: number; from: number; to: number; gainMs: number };

/**
 * The frog's belly deck: the glass bar under the hero frog holding the state,
 * what the next task does, and six fly-meal pips. Feeding pours in pip by pip
 * over a pale heal trail; the next empty pip breathes while the frog is hungry.
 */
export function FrogBellyDeck({
  hunger,
  maxHunger,
  animateHunger = true,
  onPress,
  className,
}: {
  hunger?: number;
  maxHunger?: number;
  animateHunger?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [displayedHunger, setDisplayedHunger] = React.useState(hunger ?? 0);
  const displayedRef = React.useRef(displayedHunger);
  displayedRef.current = displayedHunger;
  const prevHungerRef = React.useRef<number | null>(null);
  const feedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedIdRef = React.useRef(0);
  const [feed, setFeed] = React.useState<Feed | null>(null);
  const [feedActive, setFeedActive] = React.useState(false);

  React.useEffect(() => {
    if (typeof hunger !== 'number') return;
    const prev = prevHungerRef.current;
    prevHungerRef.current = hunger;
    const shown = displayedRef.current;
    setDisplayedHunger(hunger);
    if (
      prev !== null &&
      hunger - prev > 60_000 &&
      typeof maxHunger === 'number' &&
      maxHunger > 0
    ) {
      const toPercent = (ms: number) =>
        Math.max(0, Math.min(100, (ms / maxHunger) * 100));
      feedIdRef.current += 1;
      setFeed({
        id: feedIdRef.current,
        from: toPercent(Math.min(shown, prev)),
        to: toPercent(hunger),
        gainMs: hunger - prev,
      });
      setFeedActive(true);
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      feedTimerRef.current = setTimeout(() => setFeedActive(false), FEED_HOLD_MS);
    }
  }, [hunger, maxHunger]);

  React.useEffect(
    () => () => {
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    },
    [],
  );

  // One tick per minute: at multi-day hunger scales a 1s tick moves the bar
  // sub-pixel while re-rendering the whole hero for an invisible change.
  React.useEffect(() => {
    if (!animateHunger) return;
    const interval = setInterval(() => {
      setDisplayedHunger((prev) => (prev <= 0 ? 0 : prev - 60_000));
    }, 60_000);
    return () => clearInterval(interval);
  }, [animateHunger]);

  if (typeof hunger !== 'number' || typeof maxHunger !== 'number' || maxHunger <= 0) {
    return (
      <div
        data-fly-hero-card
        className={cn(
          'relative z-10 h-[54px] w-[340px] max-w-[min(94vw,100%)] rounded-[18px] border border-border/50 bg-card/80 shadow-sm backdrop-blur-2xl',
          className,
        )}
      />
    );
  }

  const percent = Math.max(0, Math.min(100, (displayedHunger / maxHunger) * 100));
  const tone = getHungerState(percent);
  const hint = bellyHint(Math.max(0, displayedHunger), maxHunger);
  const choreograph = feedActive && !!feed && !reduceMotion;
  const firstFedPip = feed
    ? Math.min(HUNGER_SEGMENTS - 1, Math.floor((feed.from / 100) * HUNGER_SEGMENTS))
    : 0;
  const pipDelay = (i: number) =>
    choreograph ? Math.max(0, i - firstFedPip) * PIP_STAGGER_MS : 0;
  const filledByFeed = (i: number) =>
    !!feed &&
    segmentFill(feed.from, i) < FULL_PIP &&
    segmentFill(feed.to, i) >= FULL_PIP;
  const nextPip = Array.from({ length: HUNGER_SEGMENTS }).findIndex(
    (_, i) => segmentFill(percent, i) < FULL_PIP,
  );
  const breatheNext = animateHunger && !feedActive && percent <= 40;
  const reachedFull =
    choreograph && !!feed && feed.to >= 97 && feed.from < 97;
  const lastFedDelay = feed
    ? pipDelay(
        Math.min(
          HUNGER_SEGMENTS - 1,
          Math.ceil((feed.to / 100) * HUNGER_SEGMENTS) - 1,
        ),
      )
    : 0;
  const gainHours = feed ? Math.max(1, Math.round(feed.gainMs / 3_600_000)) : 0;

  const title = feedActive && feed ? `Yum! +${gainHours}h` : tone.label;
  const subtitle =
    feedActive && feed && feed.to >= 97 ? 'Belly full!' : hint;

  const content = (
    <div className="relative flex h-full w-full items-center gap-2.5 px-3">
      <div className="relative h-[30px] w-[92px] shrink-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={feedActive && feed ? `feed-${feed.id}` : 'state'}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="absolute inset-0 flex flex-col justify-center text-left"
          >
            <span
              className={cn(
                'whitespace-nowrap text-[13px] font-black leading-none transition-colors duration-300',
                feedActive ? 'text-emerald-600 dark:text-emerald-400' : tone.text,
              )}
            >
              {title}
            </span>
            <span className="mt-[5px] whitespace-nowrap text-[11px] font-bold leading-none text-muted-foreground">
              {subtitle}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${tone.label}, ${hint}`}
        aria-label="Frog belly"
        className="relative flex flex-1 items-center gap-1.5"
      >
        {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => {
          const delay = pipDelay(i);
          const pop = choreograph && filledByFeed(i);
          const popAt = delay + PIP_FILL_MS * 0.55;
          return (
            <div key={i} className="relative flex-1">
              <BellyPip
                fill={segmentFill(percent, i)}
                ghostFill={choreograph ? segmentFill(feed!.to, i) : undefined}
                tone={tone}
                animate={animateHunger || choreograph}
                delayMs={delay}
                breathing={breatheNext && i === nextPip}
                popAnimation={
                  pop
                    ? `belly-pip-pop-${feed!.id % 2} 460ms cubic-bezier(0.34,1.56,0.64,1) ${popAt}ms both`
                    : undefined
                }
                className="h-[18px] w-full"
              />
              {pop && (
                <span
                  key={feed!.id}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full bg-white opacity-0 shadow-[0_0_12px_rgba(255,255,255,0.9)]"
                  style={{ animation: `belly-flash 480ms ease-out ${popAt}ms forwards` }}
                />
              )}
            </div>
          );
        })}
        {reachedFull && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden rounded-full"
          >
            <span
              key={feed!.id}
              className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent"
              style={{
                animation: `bar-shine 900ms ease-out ${lastFedDelay + PIP_FILL_MS}ms both`,
              }}
            />
          </span>
        )}
      </div>
    </div>
  );

  const shell = cn(
    'relative z-10 flex h-[54px] w-[340px] max-w-[min(94vw,100%)] items-center justify-center rounded-[18px] border border-border/50 bg-card/80 px-2 shadow-sm backdrop-blur-2xl',
    className,
  );

  const highlight = (
    <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />
  );

  if (onPress) {
    return (
      <button
        type="button"
        data-fly-hero-card
        data-hint="hunger-bar"
        onClick={onPress}
        aria-label={`Belly: ${tone.label}. ${hint}. How feeding works`}
        className={cn(
          shell,
          'transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        {highlight}
        {content}
      </button>
    );
  }

  return (
    <div data-fly-hero-card data-hint="hunger-bar" className={shell}>
      {highlight}
      {content}
    </div>
  );
}
