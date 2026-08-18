'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { hapticCelebrate } from '@/lib/haptics';
import { SquarePlay, Trophy } from 'lucide-react';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import { byId as catalogById } from '@/lib/skins/catalog';
import { useRewardGate } from '@/hooks/useRewardGate';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';
import type {
  CheckInResult,
  LoginStreakRewardSummary,
} from '@/lib/streak/types';

function RewardChips({
  summary,
  flies,
}: {
  summary: LoginStreakRewardSummary;
  flies: number;
}) {
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of summary.grantedItemIds) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [summary.grantedItemIds]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {flies > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-lg font-black text-white backdrop-blur">
          <Fly size={22} paused y={-2} />+{flies}
        </span>
      )}
      {summary.shieldsGranted > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-lg font-black text-white backdrop-blur">
          <Icon name="lilyPad" label="Lily Pad" className="h-5 w-5" />+
          {summary.shieldsGranted}
        </span>
      )}
      {Object.entries(itemCounts).map(([itemId, count]) => {
        const item = catalogById[itemId];
        return (
          <span
            key={itemId}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-black text-white backdrop-blur"
          >
            {item?.icon ? (
              <img
                src={item.icon}
                alt={item?.name ?? 'Item'}
                className="h-8 w-8 object-contain"
              />
            ) : null}
            {item?.name ?? 'Item'}
            {count > 1 ? ` ×${count}` : ''}
          </span>
        );
      })}
    </div>
  );
}

export function StreakCelebration({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: CheckInResult;
}) {
  useEffect(() => {
    if (!open) return;
    confetti({
      particleCount: 120,
      spread: 100,
      startVelocity: 42,
      origin: { y: 0.4 },
      zIndex: 99999,
    });
    hapticCelebrate();
  }, [open]);

  const goal = result.goalEvent;
  const claimId = goal?.rewardSummary.doubleClaimId;
  const baseFlies = goal?.rewardSummary.fliesGranted ?? 0;
  const [flies, setFlies] = useState(baseFlies);
  const [doubled, setDoubled] = useState(false);
  const {
    mode,
    run,
    busy: doubling,
    error: doubleError,
    plusModal,
  } = useRewardGate('streak_commitment_double');

  useEffect(() => {
    setFlies(baseFlies);
    setDoubled(false);
  }, [baseFlies, claimId]);

  const handleDouble = () => {
    if (!claimId || doubled || doubling) return;
    void run(async () => {
      const res = await fetch('/api/rewards/double', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.granted) return;
      setDoubled(true);
      setFlies((current) => current * 2);
      markFlyEarn();
      mutateInventoryCaches();
    });
  };

  return (
    <AnimatePresence>
      {open && goal && (
        <motion.div
          key="streak-celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1400] md:flex md:items-center md:justify-center md:bg-black/60 md:p-6 md:backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Streak reward"
            className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-orange-500 via-amber-500 to-amber-600 md:h-auto md:max-h-[min(40rem,calc(100dvh-3rem))] md:w-[min(100%,40rem)] md:rounded-[32px] md:shadow-2xl"
          >
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <RotatingRays colorClass="text-white" />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-4 pt-[calc(env(safe-area-inset-top)+2rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1.25rem)] md:px-8 md:pt-9">
              <motion.div
                initial={{ scale: 0.6, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="m-auto flex w-full max-w-sm shrink-0 flex-col items-center text-center md:max-w-md"
              >
                <div className="grid h-24 w-24 place-items-center rounded-full bg-white/20 backdrop-blur short-screen:h-20 short-screen:w-20">
                  <Trophy className="h-12 w-12 text-yellow-200 short-screen:h-10 short-screen:w-10" />
                </div>

                <h2 className="mt-5 text-3xl font-black tracking-tight text-white drop-shadow-sm short-screen:mt-3 short-screen:text-2xl">
                  {goal.days}-day commitment complete!
                </h2>
                <p className="mt-2 max-w-xs text-sm font-bold text-white/90 short-screen:mt-1 short-screen:text-xs">
                  You kept your commitment. Your frog is beyond proud.
                </p>

                <div className="mt-6 space-y-3 short-screen:mt-3 short-screen:space-y-2">
                  <RewardChips summary={goal.rewardSummary} flies={flies} />
                  {claimId && !doubled && baseFlies > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleDouble}
                        disabled={doubling}
                        className="mx-auto flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/20 px-5 text-xs font-black uppercase tracking-[0.14em] text-white backdrop-blur transition-colors hover:bg-white/30 disabled:opacity-60"
                      >
                        {!doubling && mode === 'ad' && (
                          <SquarePlay className="h-4 w-4" strokeWidth={2.5} />
                        )}
                        {doubling
                          ? mode === 'ad'
                            ? 'Loading ad…'
                            : 'Doubling…'
                          : mode === 'ad'
                            ? 'Double the flies'
                            : 'Double the flies with Plus'}
                      </button>
                      {doubleError && (
                        <p className="text-center text-[11px] font-bold text-white/80">
                          {doubleError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </div>

            <div className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-7">
              <button
                type="button"
                onClick={onClose}
                className="mx-auto block h-12 w-full max-w-[280px] rounded-2xl bg-white text-sm font-black text-amber-700 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] transition-all hover:bg-white/95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500 active:translate-y-1 active:shadow-none"
              >
                Make your next commitment
              </button>
            </div>
          </div>
          {plusModal}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
