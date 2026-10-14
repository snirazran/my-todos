'use client';

import type { ReactNode } from 'react';
import { mutate } from 'swr';
import { motion, useReducedMotion } from 'framer-motion';
import { patchInventoryFlies, mutateInventoryCaches } from '@/hooks/useInventory';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import { hapticCelebrate } from '@/lib/haptics';
import type { LeapHopResult } from '@/lib/leap/types';
import { cn } from '@/lib/utils';
import { leagueArt, leagueTitle, weekdayOf } from './leapCopy';

type ShowNotification = (
  content: ReactNode,
  action?: () => void | Promise<void>,
  options?: { durationMs?: number; actionLabel?: string },
) => void;

const GIFT_PREFIX = 'gift_box';

function HopToast({
  title,
  detail,
  from,
  to,
  target,
  stay,
  league,
  prize,
}: {
  title: string;
  detail?: string;
  from: number;
  to: number;
  target: number;
  stay?: number;
  league: number;
  prize?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const metered = target > 0;
  const safe = Math.max(1, target);
  const fromPct = Math.min(100, (Math.max(0, from) / safe) * 100);
  const toPct = Math.min(100, (Math.max(0, to) / safe) * 100);
  const full = to >= safe;
  const stayPct = stay && stay > 0 && stay < safe ? (stay / safe) * 100 : null;

  return (
    <div className="flex w-full items-center gap-3">
      <motion.div
        className={cn(
          'grid h-12 w-12 shrink-0 place-items-center rounded-2xl',
          prize ? 'bg-amber-100' : 'bg-white',
        )}
        initial={reduceMotion ? false : { scale: 0.7, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 16 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={leagueArt(league)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-10 w-10 select-none object-contain"
        />
      </motion.div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="min-w-0 text-[14px] font-black leading-tight text-foreground">
            {title}
          </span>
          {metered && (
            <span className="shrink-0 text-[12px] font-black tabular-nums text-muted-foreground">
              {Math.min(to, safe)}/{safe}
            </span>
          )}
        </span>
        {metered && (
          <span className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            {stayPct !== null && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-rose-500/25 dark:bg-rose-400/30"
                style={{ width: `${stayPct}%` }}
              />
            )}
            <motion.span
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                full ? 'bg-lime-600' : 'bg-amber-400',
              )}
              initial={reduceMotion ? false : { width: `${fromPct}%` }}
              animate={{ width: `${toPct}%` }}
              transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.15 }}
            />
            {stayPct !== null && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white/90"
                style={{ left: `${stayPct}%` }}
              />
            )}
          </span>
        )}
        {detail && (
          <span className="mt-1 text-[12px] font-bold leading-tight text-muted-foreground">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

const plusFlies = (flies: number) => (flies > 0 ? ` +${flies} flies` : '');

export type LeapHopToastSpec = {
  content: ReactNode;
  celebrate: boolean;
  gifts: string[];
  quiet: boolean;
};

export function buildLeapHopToast(result: LeapHopResult): LeapHopToastSpec | null {
  const { meter } = result;
  const base = {
    from: Math.max(0, meter.hops - result.hops),
    to: meter.hops,
    target: meter.target,
    stay: result.league > 0 && !meter.reached.includes('hold') ? meter.holdTarget : undefined,
    league: result.league,
  };
  const gifts = [
    ...(result.lucky?.grantedItemIds ?? []),
    ...result.marks.flatMap((mark) => mark.grantedItemIds),
  ].filter((id) => id.startsWith(GIFT_PREFIX));
  const leapMark = result.marks.find((mark) => mark.id === 'leap');
  const holdMark = result.marks.find((mark) => mark.id === 'hold');
  const markFlies = result.marks.reduce((sum, mark) => sum + mark.fliesGranted, 0);
  const allFlies =
    result.hopFlies + result.comebackFlies + markFlies + (result.lucky?.fliesGranted ?? 0);
  const spec = (
    content: ReactNode,
    celebrate: boolean,
    quiet = false,
    giftIds: string[] = gifts,
  ) => ({
    content,
    celebrate,
    gifts: giftIds,
    quiet,
  });

  if (leapMark) {
    return spec(
      <HopToast
        {...base}
        prize
        title={
          result.nextLeagueLabel
            ? 'Promotion zone!'
            : `Top prize won!${plusFlies(allFlies)}`
        }
        detail={
          result.nextLeagueLabel
            ? `You'll advance to the ${leagueTitle(result.nextLeagueLabel)} on ${weekdayOf(result.weekKey)}`
            : `The ${leagueTitle(result.leagueLabel)} is still yours`
        }
      />,
      true,
    );
  }
  if (result.joined || result.lucky?.first) {
    const left = Math.max(0, meter.target - meter.hops);
    return spec(
      <HopToast
        {...base}
        prize
        title={gifts.length ? 'First habit! A gift dropped' : `First habit!${plusFlies(allFlies)}`}
        detail={
          meter.target > 0 && left > 0
            ? result.nextLeagueLabel
              ? `${left} more this week to reach ${result.nextLeagueLabel}`
              : `${left} more this week for the top prize`
            : 'Every habit you finish counts'
        }
      />,
      true,
      false,
      result.joined ? [] : gifts,
    );
  }
  if (holdMark && result.league > 0) {
    return spec(
      <HopToast
        {...base}
        prize
        title={`Out of the demotion zone!${plusFlies(allFlies)}`}
        detail={`Your spot in the ${leagueTitle(result.leagueLabel)} is safe`}
      />,
      false,
    );
  }
  if (result.lucky) {
    const title = gifts.length
      ? 'Lucky hop! A gift dropped'
      : result.lucky.shieldsGranted
        ? 'Lucky hop! A Lily Pad'
        : `Lucky hop!${plusFlies(allFlies)}`;
    return spec(<HopToast {...base} prize title={title} />, true);
  }
  if (result.comebackFlies > 0) {
    return spec(<HopToast {...base} title={`Back on it!${plusFlies(allFlies)}`} />, false, true);
  }
  if (result.hops > 0 || markFlies > 0) {
    return spec(<HopToast {...base} title={`Hop!${plusFlies(allFlies)}`} />, false, true);
  }
  return null;
}

export function announceLeapHop(
  result: LeapHopResult | null | undefined,
  showNotification: ShowNotification,
) {
  if (!result) return;
  void mutate((key) => typeof key === 'string' && key.startsWith('/api/leap'));
  if (typeof result.balanceAfter === 'number') {
    patchInventoryFlies(result.balanceAfter);
  }
  if (result.grantedItemIds.length || result.shieldsGranted) {
    mutateInventoryCaches();
  }
  const spec = buildLeapHopToast(result);
  if (!spec) return;
  if (spec.celebrate) hapticCelebrate();
  const openGifts = spec.gifts.length
    ? () => {
        enqueueQuestRewardReveal(
          { fliesGranted: 0, grantedItemIds: spec.gifts },
          {
            catalog: result.catalog as RevealCatalog,
            isPremium: result.isPremium,
            showFlyGainPill: false,
          },
        );
      }
    : undefined;
  showNotification(
    spec.content,
    openGifts,
    openGifts
      ? { actionLabel: 'Open', durationMs: 7000 }
      : { durationMs: spec.quiet ? 2600 : 4200 },
  );
}
