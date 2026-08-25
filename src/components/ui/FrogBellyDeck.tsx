'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  HUNGER_SEGMENTS,
  getHungerState,
  segmentFill,
} from '@/lib/hungerDisplay';

/**
 * The frog's belly deck: the glass bar under the hero frog holding the state
 * label and six fly-meal pips, with the feed pulse and the slow visual decay.
 */
export function FrogBellyDeck({
  hunger,
  maxHunger,
  animateHunger = true,
  className,
}: {
  hunger?: number;
  maxHunger?: number;
  animateHunger?: boolean;
  className?: string;
}) {
  const [displayedHunger, setDisplayedHunger] = React.useState(hunger ?? 0);
  const prevHungerRef = React.useRef<number | null>(null);
  const feedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedGainMs, setFeedGainMs] = React.useState(0);
  const feedPulse = feedGainMs > 0;

  // Sync with prop updates; a jump of over a minute means the frog was fed
  React.useEffect(() => {
    if (typeof hunger !== 'number') return;
    const prev = prevHungerRef.current;
    prevHungerRef.current = hunger;
    setDisplayedHunger(hunger);
    if (prev !== null && hunger - prev > 60_000) {
      setFeedGainMs(hunger - prev);
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      feedTimerRef.current = setTimeout(() => setFeedGainMs(0), 1200);
    }
  }, [hunger]);

  React.useEffect(
    () => () => {
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    },
    [],
  );

  // Constant visual decay. One tick per minute: at multi-day hunger scales a
  // 1s tick moves the bar sub-pixel, but each tick re-renders and re-runs the
  // 700ms width transition — a full-viewport layout burn for an invisible
  // change.
  React.useEffect(() => {
    if (!animateHunger) return;

    const interval = setInterval(() => {
      setDisplayedHunger((prev) => {
        if (prev <= 0) return 0;
        return prev - 60_000;
      });
    }, 60_000);

    return () => clearInterval(interval);
  }, [animateHunger]);

  const hungerPercent =
    typeof displayedHunger === 'number' && typeof maxHunger === 'number'
      ? Math.max(0, Math.min(100, (displayedHunger / maxHunger) * 100))
      : 100;

  const {
    bg: hungerColor,
    text: hungerTextColor,
    label: hungerStatus,
  } = getHungerState(hungerPercent);

  return (
    <div
      data-fly-hero-card
      className={cn(
        `relative z-10 flex items-center justify-center

            w-[340px] max-w-[min(94vw,100%)] h-[50px] px-2

            bg-card/80

            backdrop-blur-2xl

            rounded-[18px]

            border border-border/50

            shadow-sm`,
        className,
      )}
    >
      {/* Decorative Top Highlight to simulate glass edge light */}
      <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />

      {/* Hunger: state label + 6 fly-meal pips (each pip = 8h) */}
      <div className="relative flex items-center w-full h-full px-3">
        {typeof hunger === 'number' ? (
          <div
            className="flex items-center gap-2.5 w-full"
            data-hint="hunger-bar"
          >
            <span
              className={cn(
                'w-[64px] shrink-0 text-[11px] font-black tracking-[0.06em] whitespace-nowrap transition-colors duration-300',
                feedPulse ? 'text-emerald-500' : hungerTextColor,
                hungerPercent <= 20 && !feedPulse && 'animate-pulse',
              )}
            >
              {feedPulse
                ? `Yum! +${Math.round(feedGainMs / 3_600_000)}h`
                : hungerStatus}
            </span>
            <div
              className={cn(
                'flex flex-1 items-center gap-1',
                feedPulse && 'animate-feed-pop',
              )}
            >
              {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => {
                const fill = segmentFill(hungerPercent, i);
                return (
                  <div
                    key={i}
                    className={cn(
                      'relative h-3.5 flex-1 overflow-hidden rounded-full bg-muted',
                      hungerPercent <= 20 && 'ring-1 ring-rose-500/15',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full',
                        hungerColor,
                        animateHunger && 'transition-all duration-700 ease-out',
                        feedPulse && 'brightness-125',
                      )}
                      style={{ width: `${fill * 100}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  );
}
