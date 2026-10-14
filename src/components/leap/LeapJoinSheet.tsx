'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { motion, useReducedMotion } from 'framer-motion';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import { hapticCelebrate } from '@/lib/haptics';
import type { LeapJoin, LeapView } from '@/lib/leap/types';
import {
  habitsWord,
  leagueArt,
  leagueName,
  leagueTitle,
  leapCompeting,
  leapHasHabits,
  leapTarget,
  nextLeagueName,
  weekEndDay,
  weekdayOf,
} from './leapCopy';

const GIFT_RIVE_FALLBACKS: Record<string, number> = {
  gift_box_1: 0,
  gift_box_rare: 1,
  gift_box_legendary: 2,
};

function joinLine(view: LeapView) {
  const { week } = view;
  if (leapHasHabits(view) && leapCompeting(view) && !week.leap.reached) {
    const next = nextLeagueName(view);
    const target = habitsWord(leapTarget(view));
    return next
      ? `Finish ${target} by ${weekEndDay(week.weekKey)} to advance to the ${leagueTitle(next)}.`
      : `Finish ${target} by ${weekEndDay(week.weekKey)} to win the top prize.`;
  }
  if (week.daysLeft <= 1 && week.scheduledDays < 2) {
    return `Every habit you finish counts. Your league week starts ${weekdayOf(week.weekKey)}.`;
  }
  return 'Every habit you finish counts toward your weekly league.';
}

export function openJoinGifts(join: LeapJoin, view: LeapView) {
  if (!join.giftIds.length) return;
  enqueueQuestRewardReveal(
    { fliesGranted: 0, grantedItemIds: join.giftIds },
    {
      catalog: view.rewardCatalog as RevealCatalog,
      isPremium: view.isPremium,
      showFlyGainPill: false,
    },
  );
}

export function LeapJoinContent({
  join,
  view,
  active,
  onClose,
  quiet = false,
}: {
  join: LeapJoin;
  view: LeapView;
  active: boolean;
  onClose: (openGift: boolean) => void;
  quiet?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const gift = join.giftIds[0];
  const giftItem = gift
    ? (view.rewardCatalog[gift] as { riveIndex?: unknown } | undefined)
    : undefined;
  const giftRiveIndex =
    typeof giftItem?.riveIndex === 'number'
      ? giftItem.riveIndex
      : (GIFT_RIVE_FALLBACKS[gift ?? ''] ?? 0);

  useEffect(() => {
    if (!active || quiet) return;
    const timer = window.setTimeout(() => {
      hapticCelebrate();
      if (!reduceMotion) {
        void confetti({ particleCount: 60, spread: 65, origin: { y: 0.45 }, zIndex: 2000 });
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [active, quiet, reduceMotion]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-36 w-full items-end justify-center">
        <motion.img
          src={leagueArt(view.league)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="relative h-32 w-40 object-contain drop-shadow-[0_0_14px_rgba(202,138,4,0.45)] dark:drop-shadow-[0_0_12px_rgba(245,179,1,0.35)]"
          initial={reduceMotion ? false : { scale: 0.4, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
        />
      </div>

      <motion.h2
        className="mt-3 text-[24px] font-black leading-tight tracking-tight text-foreground"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
      >
        You joined the {leagueTitle(leagueName(view))}!
      </motion.h2>
      <motion.p
        className="mt-1 max-w-[300px] text-[14px] font-semibold leading-snug text-muted-foreground"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.5 }}
      >
        {joinLine(view)}
      </motion.p>

      <button
        type="button"
        onClick={() => onClose(!!gift)}
        className="mt-6 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition active:translate-y-[2px] active:shadow-none"
      >
        {gift && (
          <span aria-hidden="true" className="-my-5 -ml-1 aspect-[282/381] h-[60px] w-auto shrink-0 -translate-y-[12px]">
            <GiftRive
              className="h-full w-full"
              color={giftRiveIndex}
              paused={!active || !!reduceMotion}
              ambient="jump"
            />
          </span>
        )}
        {gift ? 'Open your gift' : "Let's go"}
      </button>
    </div>
  );
}

export function LeapJoinSheet({
  join,
  view,
  open,
  onClose,
}: {
  join: LeapJoin;
  view: LeapView;
  open: boolean;
  onClose: (openGift: boolean) => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose(false);
      }}
      zIndex={1320}
      className="select-none sm:max-w-[420px]"
      closeAriaLabel="Close"
    >
      {() => (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 sm:px-6 sm:pb-6 sm:pt-8">
          <LeapJoinContent join={join} view={view} active={open} onClose={onClose} />
        </div>
      )}
    </BaseSheet>
  );
}
