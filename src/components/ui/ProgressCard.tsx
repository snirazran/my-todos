'use client';

import React, { useMemo } from 'react';
import { Lock, CheckCircle2, Sparkles, CalendarDays } from 'lucide-react';
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
    // 1. Calculate targets for all 3 slots first
    const targets = [0, 1, 2].map((i) => {
      if (total === 0) return 0;
      let giftsAllowedBasedOnTotal = 3;
      if (total <= 2) giftsAllowedBasedOnTotal = 1;
      else if (total <= 5) giftsAllowedBasedOnTotal = 2;
      else if (total >= 6) giftsAllowedBasedOnTotal = 3;
      else giftsAllowedBasedOnTotal = 3;

      if (i >= giftsAllowedBasedOnTotal) return 9999;

      return Math.round(((i + 1) * total) / giftsAllowedBasedOnTotal);
    });

    // 2. Map to slot objects with status and percentage
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
        return {
          status: 'LOCKED',
          req: unlockRequirement,
          percent: 0,
          current: 0,
          total: 0,
        };
      }

      const targetTaskCount = targets[i];
      const prevTarget = i === 0 ? 0 : targets[i - 1];

      // Calculate progress for THIS specific slot
      const range = targetTaskCount - prevTarget;
      const progressInSlot = Math.max(0, done - prevTarget);
      const cappedProgress = Math.min(range, progressInSlot);
      const percentage = range > 0 ? (cappedProgress / range) * 100 : 100;

      const isClaimed = i < giftsClaimed;
      const isReady = !isClaimed && done >= targetTaskCount;

      return {
        status: isClaimed ? 'CLAIMED' : isReady ? 'READY' : 'PENDING',
        target: targetTaskCount,
        percent: percentage,
        current: cappedProgress,
        total: range,
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
      return `You're doing great! Just ${remainingTasks} ${
        remainingTasks === 1 ? 'task' : 'tasks'
      } left to complete.`;
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

            // For circular progress
            const radius = 18;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset =
              circumference - (slot.percent / 100) * circumference;

            return (
              <div
                key={idx}
                className={`
                  relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300 overflow-hidden min-h-[90px]
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
                {/* Icon Container */}
                <div className="relative z-10 flex items-center justify-center w-12 h-12 mb-1">
                  {slot.status === 'LOCKED' ? (
                    <Lock className="w-5 h-5 text-slate-400" />
                  ) : slot.status === 'CLAIMED' ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <>
                      {/* Circular Progress (Only for PENDING/READY) */}
                      {slot.status === 'PENDING' && (
                        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                          <circle
                            cx="24"
                            cy="24"
                            r={radius}
                            className="stroke-slate-200 dark:stroke-slate-700"
                            strokeWidth="3"
                            fill="none"
                          />
                          <circle
                            cx="24"
                            cy="24"
                            r={radius}
                            className="transition-all duration-700 ease-out stroke-purple-500"
                            strokeWidth="3"
                            fill="none"
                            strokeLinecap="round"
                            style={{
                              strokeDasharray: circumference,
                              strokeDashoffset: strokeDashoffset,
                            }}
                          />
                        </svg>
                      )}

                      <div
                        className={`relative z-10 ${
                          slot.status === 'READY'
                            ? 'w-10 h-10 animate-bounce drop-shadow-lg'
                            : 'w-7 h-7'
                        }`}
                      >
                        <Image
                          src="/gift1.png"
                          alt="Gift"
                          width={40}
                          height={40}
                          className={`object-contain ${
                            slot.status === 'PENDING' ? 'opacity-90' : ''
                          }`}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Status Text */}
                <span
                  className={`text-[9px] font-bold uppercase text-center leading-tight relative z-10
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
                    'Open Now!'
                  ) : (
                    /* Show explicit progress for pending items */
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] tabular-nums tracking-wide">
                        {slot.current} / {slot.total}
                      </span>
                      <span className="text-[8px] opacity-70">Completed</span>
                    </div>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : allTasksDone ? (
        <div className="relative p-4 mb-4 overflow-hidden border border-indigo-100 rounded-xl dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950/30 group">
          <div className="relative z-10 flex flex-col gap-3">
            {/* Header Badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 text-green-600 bg-green-100 rounded-full dark:bg-green-900/50 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3" />
              </div>
              <span className="text-xs font-bold tracking-wider text-green-700 uppercase dark:text-green-400">
                All Daily Rewards Claimed
              </span>
            </div>

            {/* Actionable Content */}
            <div className="flex items-start gap-3 pl-1">
              <div className="p-2 text-indigo-500 bg-white border rounded-lg shadow-sm dark:bg-slate-800 border-slate-100 dark:border-slate-700 shrink-0">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Plan Ahead for Tomorrow
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Set up your tasks now to get a head start. <br />
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Future You
                  </span>{' '}
                  deserves those easy wins (and gifts)!
                </p>
              </div>
            </div>
          </div>

          {/* Decorative Background Icon */}
          <div className="absolute transition-transform duration-700 transform -bottom-2 -right-2 opacity-5 rotate-12 group-hover:rotate-6 group-hover:scale-110">
            <Image
              src="/gift1.png"
              width={80}
              height={80}
              alt="Gift Decoration"
            />
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
