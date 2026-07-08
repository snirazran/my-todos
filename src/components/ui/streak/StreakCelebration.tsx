'use client';

import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, Snowflake, Trophy } from 'lucide-react';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import Fly from '@/components/ui/fly';
import { byId as catalogById } from '@/lib/skins/catalog';
import type {
  CheckInResult,
  LoginStreakRewardSummary,
} from '@/lib/streak/types';

function RewardChips({ summary }: { summary: LoginStreakRewardSummary }) {
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of summary.grantedItemIds) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [summary.grantedItemIds]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {summary.fliesGranted > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-lg font-black text-white backdrop-blur">
          <Fly size={22} paused y={-2} />+{summary.fliesGranted}
        </span>
      )}
      {summary.freezesGranted > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-lg font-black text-white backdrop-blur">
          <Snowflake className="h-5 w-5 text-sky-300" />+
          {summary.freezesGranted}
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
    try {
      navigator.vibrate?.([30, 40, 60]);
    } catch {}
  }, [open]);

  const milestone = result.milestoneEvents[result.milestoneEvents.length - 1];
  const goal = result.goalEvent;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="streak-celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1400] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-orange-500 via-amber-500 to-amber-600 px-6"
        >
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <RotatingRays colorClass="text-white" />
          </div>

          <motion.div
            initial={{ scale: 0.6, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="relative flex flex-col items-center text-center"
          >
            <div className="grid h-24 w-24 place-items-center rounded-full bg-white/20 backdrop-blur">
              {goal ? (
                <Trophy className="h-12 w-12 text-yellow-200" />
              ) : (
                <Flame className="h-12 w-12 fill-yellow-200 text-yellow-100" />
              )}
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-tight text-white drop-shadow-sm">
              {goal
                ? `${goal.days}-day goal complete!`
                : `${milestone?.days}-day streak!`}
            </h2>
            <p className="mt-2 max-w-xs text-sm font-bold text-white/90">
              {goal
                ? 'You kept your commitment. Your frog is beyond proud.'
                : 'An incredible milestone. Keep the flame alive!'}
            </p>

            <div className="mt-6 space-y-3">
              {goal && <RewardChips summary={goal.rewardSummary} />}
              {!goal && milestone && (
                <RewardChips summary={milestone.rewardSummary} />
              )}
              {goal && milestone && (
                <div className="pt-1">
                  <p className="pb-2 text-xs font-black uppercase tracking-widest text-white/70">
                    + {milestone.days}-day milestone
                  </p>
                  <RewardChips summary={milestone.rewardSummary} />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-9 h-12 w-full max-w-[260px] rounded-2xl bg-white text-sm font-black text-amber-700 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1 active:shadow-none"
            >
              {goal ? 'Set your next goal' : 'Keep it going'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
