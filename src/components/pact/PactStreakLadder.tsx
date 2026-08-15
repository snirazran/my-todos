'use client';

import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RewardTile, type QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import type { PactLadderRung } from '@/lib/pact/types';
import { usePactView } from './PactCard';

/** Plain words beat symbols in a sentence; symbols beat words on a chip. */
function rateWord(multiplier: number) {
  if (multiplier <= 1) return 'normal';
  if (multiplier === 2) return 'double';
  if (multiplier === 3) return 'triple';
  return `${multiplier}×`;
}

function giftWord(rarity?: string) {
  if (rarity === 'legendary') return 'a legendary gift';
  if (rarity === 'epic') return 'an epic gift';
  if (rarity === 'rare') return 'a rare gift';
  return 'a gift';
}

export function PactStreakLadder() {
  const { data } = usePactView();
  if (!data || !data.enabled || data.needsAreas) return null;

  const { ladder, streak } = data;
  const rungs = ladder.rungs;
  if (rungs.length === 0) return null;

  const rewardCatalog = data.rewardCatalog as Record<
    string,
    QuestRewardCatalogItem
  >;
  const weeks = streak.weeks;
  const rate = ladder.multiplier;
  const nextIndex = rungs.findIndex((rung) => !rung.reached);
  const nextRung = nextIndex === -1 ? null : rungs[nextIndex];
  const toGo = nextRung ? Math.max(1, nextRung.weeks - weeks) : 0;

  // The rung the hero shows: the one being climbed toward, or — once the top
  // is reached — the one being paid, since there is nothing left to promise.
  const shown = nextRung ?? rungs[rungs.length - 1];
  const isFinalRung = !!nextRung && nextIndex === rungs.length - 1;
  const shownGift = shown.rewards[0] ?? null;
  const shownRarity = shownGift?.itemId
    ? rewardCatalog[shownGift.itemId]?.rarity
    : undefined;

  // Rungs sit at even spacing rather than true week distance — 2/4/8/12 to
  // scale crushes the first two together — so the fill is interpolated between
  // node centres to keep the rail honest about where it stands.
  const cols = rungs.length;
  const nodeCenter = (index: number) => ((index + 0.5) / cols) * 100;
  const pct = (() => {
    if (nextIndex === -1) return nodeCenter(cols - 1);
    const fromWeeks = rungs[nextIndex - 1]?.weeks ?? 0;
    const fromPct = nodeCenter(nextIndex - 1);
    const span = rungs[nextIndex].weeks - fromWeeks;
    const fraction =
      span > 0 ? Math.min(1, Math.max(0, (weeks - fromWeeks) / span)) : 0;
    return fromPct + (nodeCenter(nextIndex) - fromPct) * fraction;
  })();

  const headline = nextRung
    ? `${toGo} more week${toGo === 1 ? '' : 's'} for ${rateWord(nextRung.multiplier)} flies and ${giftWord(shownRarity)}`
    : `Every week pays ${rateWord(rate)} flies and ${giftWord(shownRarity)}`;

  return (
    <div className="mx-1.5 w-[calc(100%-0.75rem)] rounded-[24px] border border-border/50 bg-card px-3.5 py-3 shadow-sm md:mx-4 md:w-[calc(100%-2rem)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            <Flame
              className={cn(
                'h-3.5 w-3.5',
                weeks > 0
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-muted-foreground/50',
              )}
              strokeWidth={2.25}
            />
            {weeks > 0
              ? `${weeks} week${weeks === 1 ? '' : 's'} · paying ${rateWord(rate)}`
              : 'No streak yet'}
          </p>
          <p className="mt-1 text-[14px] font-black leading-snug text-foreground">
            {headline}
          </p>
        </div>
        {/* Laps outrank best-week once the ladder resets: a finished climb is
            the achievement, and "Best 12" would read as a streak lost. */}
        {streak.laps > 0 ? (
          <span className="shrink-0 rounded-lg bg-amber-400/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {streak.laps}× climbed
          </span>
        ) : streak.best > weeks ? (
          <span className="shrink-0 rounded-lg bg-muted/60 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Best {streak.best}
          </span>
        ) : null}
      </div>

      {/* What a week at that rung actually hands over, as two separate prizes
          joined by a plus. Each badge sits on the one thing it counts: the
          multiplier belongs to the flies, and the box is simply a box. */}
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-border/50 bg-muted/25 px-3 py-2.5">
        {shownGift && (
          <RewardTile
            reward={shownGift}
            rewardCatalog={rewardCatalog}
            isPremium={data.isPremium}
            hideBadge
            hydrateDelayMs={120}
            giftAnimation="box_shake"
          />
        )}
        <span className="text-[15px] font-black text-muted-foreground/60">
          +
        </span>
        <div className="relative shrink-0">
          <RewardTile
            reward={{ type: 'FLIES', amount: 1 }}
            rewardCatalog={rewardCatalog}
            isPremium={data.isPremium}
            hideBadge
            flySize={26}
          />
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-black leading-none tabular-nums text-white shadow-sm backdrop-blur-sm">
            ×{shown.multiplier}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-black leading-tight text-foreground">
            {shownRarity === 'legendary'
              ? 'Legendary gift'
              : shownRarity === 'rare'
                ? 'Rare gift'
                : 'Gift'}
            {/* The rate, never the total. A fly count is only true for the
                session count picked this week, so it silently changed under
                anyone who committed to a different number next week. */}
            {` + ×${shown.multiplier} flies`}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {isFinalRung
              ? 'Final milestone — then the ladder starts over'
              : nextRung
                ? 'In next milestone'
                : 'Every week you keep the streak'}
          </p>
        </div>
      </div>

      {/* The rail is the progress bar and the ladder at once: each stop is a
          rate, the fill is how far along the climb this week stands. */}
      <div className="relative mt-3.5">
        <div className="absolute inset-x-3 top-[15px] h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute left-3 top-[15px] h-1.5 -translate-y-1/2 rounded-full bg-amber-400 transition-all duration-500"
          style={{ width: `calc(${pct}% - 0.75rem)` }}
        />
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {rungs.map((rung: PactLadderRung, index) => {
            const state = rung.reached
              ? 'reached'
              : index === nextIndex
                ? 'next'
                : 'locked';
            return (
              <div
                key={rung.weeks}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    'grid h-[30px] min-w-[36px] place-items-center rounded-full px-2 text-[12px] font-black tabular-nums leading-none ring-4 ring-card',
                    state === 'reached' && 'bg-amber-400 text-amber-950',
                    state === 'next' &&
                      'border-2 border-amber-400 bg-card text-amber-600 dark:text-amber-400',
                    state === 'locked' && 'bg-muted text-muted-foreground/70',
                  )}
                >
                  ×{rung.multiplier}
                </span>
                <span
                  className={cn(
                    'text-[9.5px] font-black uppercase tracking-wider tabular-nums',
                    state === 'locked'
                      ? 'text-muted-foreground/60'
                      : 'text-foreground',
                  )}
                >
                  {rung.weeks === 0 ? 'Now' : `${rung.weeks} wk`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
