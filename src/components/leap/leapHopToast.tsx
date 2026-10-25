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
import { hopProgressLine, leagueArt } from './leapCopy';
import { queueLeapZoneMoment } from './LeapZoneSheet';

type ShowNotification = (
  content: ReactNode,
  action?: () => void | Promise<void>,
  options?: { durationMs?: number; actionLabel?: string },
) => void;

const GIFT_PREFIX = 'gift_box';

function HopToast({
  title,
  detail,
  league,
}: {
  title: string;
  detail: string;
  league: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex w-full items-center gap-3">
      <motion.div
        className="grid h-12 w-12 shrink-0 place-items-center"
        initial={reduceMotion ? false : { scale: 0.6, rotate: -10, y: 6 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 15 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={leagueArt(league)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-12 w-12 select-none object-contain"
        />
      </motion.div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[14px] font-black text-foreground">{title}</span>
        <span className="mt-0.5 text-[13px] font-bold text-muted-foreground">{detail}</span>
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
  const gifts = [
    ...(result.lucky?.grantedItemIds ?? []),
    ...result.marks.flatMap((mark) => mark.grantedItemIds),
  ].filter((id) => id.startsWith(GIFT_PREFIX));
  const holdMark = result.marks.find((mark) => mark.id === 'hold');
  const markFlies = result.marks.reduce((sum, mark) => sum + mark.fliesGranted, 0);
  const allFlies =
    result.hopFlies + result.comebackFlies + markFlies + (result.lucky?.fliesGranted ?? 0);
  const detail = hopProgressLine(result);
  const spec = (title: string, celebrate: boolean, quiet = false): LeapHopToastSpec => ({
    content: <HopToast title={title} detail={detail} league={result.league} />,
    celebrate,
    gifts,
    quiet,
  });

  if (result.lucky?.first) {
    return spec(gifts.length ? 'First habit! A gift dropped' : `First habit!${plusFlies(allFlies)}`, true);
  }
  if (holdMark && result.league > 0) {
    return spec(`${result.leagueLabel} is safe!${plusFlies(allFlies)}`, false);
  }
  if (result.lucky) {
    const title = gifts.length
      ? 'Lucky hop! A gift dropped'
      : result.lucky.shieldsGranted
        ? 'Lucky hop! A Lily Pad'
        : `Lucky hop!${plusFlies(allFlies)}`;
    return spec(title, true);
  }
  if (result.comebackFlies > 0) return spec(`Back on it!${plusFlies(allFlies)}`, false, true);
  if (result.hops > 0 || markFlies > 0) return spec(`Hop!${plusFlies(allFlies)}`, false, true);
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
  if (result.joined) return;
  if (result.marks.some((mark) => mark.id === 'leap')) {
    queueLeapZoneMoment(result);
    return;
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
      : { durationMs: spec.quiet ? 4800 : 6000 },
  );
}
