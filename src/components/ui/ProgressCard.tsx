'use client';

import React, { useMemo } from 'react';
import { Lock, CheckCircle2, Sparkles } from 'lucide-react';
import Image from 'next/image';

interface ProgressCardProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
}

export default function ProgressCard({
  rate,
  done,
  total,
  giftsClaimed = 0,
}: ProgressCardProps) {
  // === LOGIC: REWARD TRACK ===
  const slots = useMemo(() => {
    return [0, 1, 2].map((i) => {
      let isLocked = false;
      let unlockRequirement = 0;

      if (i === 0) {
        isLocked = total === 0;
        unlockRequirement = 1;
      } else if (i === 1) {
        isLocked = total < 3;
        unlockRequirement = 3;
      } else if (i === 2) {
        isLocked = total < 6;
        unlockRequirement = 6;
      }

      if (isLocked) {
        return { status: 'LOCKED', req: unlockRequirement };
      }

      const getTargetTaskCountForSlot = (
        slotIndex: number,
        currentTotal: number
      ) => {
        if (currentTotal === 0) return 0;
        let giftsAllowedBasedOnTotal = 3;
        if (currentTotal <= 2) giftsAllowedBasedOnTotal = 1;
        else if (currentTotal <= 5) giftsAllowedBasedOnTotal = 2;
        else if (currentTotal >= 6) giftsAllowedBasedOnTotal = 3;
        else giftsAllowedBasedOnTotal = 3;

        if (slotIndex >= giftsAllowedBasedOnTotal) return 9999;

        const milestoneResults: number[] = [];
        for (let j = 1; j <= giftsAllowedBasedOnTotal; j++) {
          milestoneResults.push(
            Math.round((j * currentTotal) / giftsAllowedBasedOnTotal)
          );
        }
        return milestoneResults[slotIndex];
      };

      const targetTaskCount = getTargetTaskCountForSlot(i, total);

      const isClaimed = i < giftsClaimed;
      const isReady = !isClaimed && done >= targetTaskCount;

      return {
        status: isClaimed ? 'CLAIMED' : isReady ? 'READY' : 'PENDING',
        target: targetTaskCount,
      };
    });
  }, [total, done, giftsClaimed]);

  const allGiftsClaimed = slots.every((s) => s.status === 'CLAIMED');
  const allTasksDone = done === total;
  const allDoneForToday = allGiftsClaimed && allTasksDone;

  // === DYNAMIC STATUS MESSAGE ===
  const statusMessage = useMemo(() => {
    if (allDoneForToday) return 'All rewards & tasks complete! Great job.';
        if (allGiftsClaimed && !allTasksDone) {
            const remainingTasks = total - done;
            return `You're doing great! Just ${remainingTasks} ${remainingTasks === 1 ? 'task' : 'tasks'} left to complete.`;
        }
    if (total === 0) return 'Add your first task to start tracking!';
    const readySlot = slots.find((s) => s.status === 'READY');
    if (readySlot) return 'You have a gift ready to open!';
    const nextSlot = slots.find((s) => s.status !== 'CLAIMED');
    if (!nextSlot) return 'All daily rewards collected!';
    if (nextSlot.status === 'LOCKED') {
      const needed = (nextSlot.req as number) - total;
      return `Add ${needed} ${
        needed === 1 ? 'task' : 'tasks'
      } for today to unlock the next gift.`;
    }
    if (nextSlot.status === 'PENDING') {
      const left = (nextSlot.target as number) - done;
      return `Complete ${left} ${
        left === 1 ? 'more task' : 'more tasks'
      } to open your next gift.`;
    }
    return 'Keep going!';
  }, [slots, total, done, allGiftsClaimed, allTasksDone]);

  return (
    <div
      dir="ltr"
      className="relative z-10 py-4 px-4 mb-6 rounded-[20px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-sm overflow-visible transition-all duration-500 ease-in-out"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Daily Progress
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            {statusMessage}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {done}
            <span className="ml-1 text-sm font-bold text-slate-400">
              /{total}
            </span>
          </div>
        </div>
      </div>

      {/* CONTENT: Grid if rewards pending; Banner if 100% done; Nothing if rewards done but tasks remain */}
      {!allGiftsClaimed ? (
        <div className="grid grid-cols-3 gap-3 mb-4 sm:gap-4">
          {slots.map((slot, idx) => {
            const pendingLeft =
              slot.status === 'PENDING' ? (slot.target as number) - done : 0;
            const lockedNeeded =
              slot.status === 'LOCKED' ? (slot.req as number) - total : 0;
            const isNextTarget =
              slot.status === 'PENDING' &&
              slots
                .slice(0, idx)
                .every((s) => s.status === 'CLAIMED' || s.status === 'READY');

            return (
              <div
                key={idx}
                className={`
                  relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300 overflow-hidden
                  ${
                    slot.status === 'LOCKED'
                      ? 'bg-slate-100/50 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-700 opacity-70'
                      : slot.status === 'CLAIMED'
                      ? 'bg-transparent border-slate-200 dark:border-slate-700 opacity-80'
                      : slot.status === 'READY'
                      ? 'bg-purple-100 dark:bg-purple-900/20 border-purple-400 dark:border-purple-500 shadow-md scale-105'
                      : isNextTarget
                      ? 'bg-white/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 shadow-sm'
                      : 'bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }
                `}
              >
                {/* Icon */}
                <div className="relative z-10 flex items-center justify-center">
                  {slot.status === 'LOCKED' ? (
                    <Lock className="w-4 h-4 text-slate-400" />
                  ) : slot.status === 'CLAIMED' ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <div
                      className={`relative w-8 h-8 ${
                        slot.status === 'READY'
                          ? 'animate-bounce drop-shadow-lg'
                          : ''
                      }`}
                    >
                      <Image
                        src="/gift1.png"
                        alt="Gift"
                        width={32}
                        height={32}
                        className="object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Status Text */}
                <span
                  className={`text-[9px] font-bold uppercase mt-1 text-center leading-tight relative z-10
                  ${
                    slot.status === 'LOCKED'
                      ? 'text-slate-400'
                      : slot.status === 'CLAIMED'
                      ? 'text-slate-400 dark:text-slate-500'
                      : slot.status === 'READY'
                      ? 'text-purple-600 dark:text-purple-400'
                      : isNextTarget
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-500'
                  }
                `}
                >
                  {slot.status === 'LOCKED' ? (
                    <>
                      Add {lockedNeeded}
                      <br />
                      {lockedNeeded === 1 ? 'Task' : 'Tasks'}
                    </>
                  ) : slot.status === 'CLAIMED' ? (
                    'Collected'
                  ) : slot.status === 'READY' ? (
                    'Unlocked'
                  ) : (
                    <>{pendingLeft} More</>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : allTasksDone ? (
        <div className="flex items-center gap-3 px-3 py-2 mb-4 border border-yellow-100 rounded-xl bg-gradient-to-r from-yellow-50/50 to-orange-50/50 dark:from-yellow-900/10 dark:to-orange-900/10 dark:border-yellow-900/20">
          <Sparkles className="w-4 h-4 text-yellow-500 dark:text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">
              All rewards collected!
            </p>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-none">
              Resets tomorrow
            </p>
          </div>
        </div>
      ) : null}

      {/* Progress Bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500 shadow-[0_0_12px_rgba(124,58,237,0.45)] transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <span>Daily Completion</span>
        <span>{Math.round(rate)}%</span>
      </div>
    </div>
  );
}
