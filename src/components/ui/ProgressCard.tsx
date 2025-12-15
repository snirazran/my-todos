'use client';

import React, { useMemo } from 'react';
import { Check, Lock, Trophy, Zap, Target } from 'lucide-react';
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
  const safeTotal = Math.max(1, total);

  // === LOGIC ===
  const milestones = useMemo(() => {
    if (total === 0) return [];
    let giftsAllowed = 3;
    if (total <= 2) giftsAllowed = 1;
    else if (total <= 5) giftsAllowed = 2;
    else giftsAllowed = 3;

    const results: number[] = [];
    for (let i = 1; i <= giftsAllowed; i++) {
      results.push(Math.round((i * total) / giftsAllowed));
    }
    return Array.from(new Set(results)).sort((a, b) => a - b);
  }, [total]);

  // Identify next milestone
  const nextMilestoneIndex = milestones.findIndex((m) => done < m);
  const nextMilestoneValue =
    nextMilestoneIndex !== -1 ? milestones[nextMilestoneIndex] : null;
  const tasksToNext = nextMilestoneValue ? nextMilestoneValue - done : 0;
  const remaining = total - done;

  // === TEXT LOGIC ===
  let title = 'Daily Progress';
  let subtitle = 'Start completing tasks';
  let icon = <Target className="w-5 h-5 text-slate-400" />;

  if (total === 0) {
    title = 'Ready to Start?';
    subtitle = 'Add tasks to earn rewards!';
  } else if (done === total) {
    if (total < 3) {
      title = 'Daily Goal Met!';
      subtitle = 'Tip: Add 3+ tasks for a 2nd gift!';
    } else if (total >= 3 && total < 6) {
      title = 'Great Work!';
      subtitle = 'Tip: Add 6+ tasks for a 3rd gift!';
    } else {
      title = 'All Clear!';
      subtitle = 'You cleared the board. Amazing!';
    }
    icon = <Trophy className="w-5 h-5 text-yellow-500" fill="currentColor" />;
  } else if (nextMilestoneValue) {
    title = tasksToNext === 1 ? 'Loot In Sight!' : 'Keep Going!';
    subtitle =
      tasksToNext === 1
        ? 'Just 1 task to your next reward.'
        : `${tasksToNext} tasks to the next reward.`;
    icon = <Zap className="w-5 h-5 text-amber-500" fill="currentColor" />;
  } else {
    // Finished gifts but tasks remain
    title = 'Finishing Move!';
    subtitle = `${remaining} tasks left. You got this!`;
    icon = <Target className="w-5 h-5 text-blue-500" />;
  }

  return (
    <div
      dir="ltr"
      className="relative z-10 p-5 mb-6 rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-visible"
    >
      {/* Top Row: Info & Stats */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {title}
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>
        
        {/* Right Side Stats */}
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {done}
            </span>
            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">
              / {total}
            </span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Tasks Done
          </p>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative h-10 mt-2 select-none flex items-center">
        {/* Track */}
        <div className="absolute left-0 w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-100 dark:border-slate-700" />

        {/* Fill */}
        <div
          className="absolute left-0 h-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
        />

        {/* Milestones */}
        <div className="absolute inset-0 pointer-events-none">
          {milestones.map((milestoneTaskIndex, index) => {
            const isReached = done >= milestoneTaskIndex;
            const isClaimed = index < giftsClaimed;
            const isNextTarget =
              !isReached && milestoneTaskIndex === nextMilestoneValue;

            // Position
            const pct = (milestoneTaskIndex / safeTotal) * 100;
            const leftPos = `${pct}%`;

            return (
              <div
                key={milestoneTaskIndex}
                className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10"
                style={{
                  left: leftPos,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {/* 1. CLAIMED: Check Badge */}
                {isClaimed && (
                  <div className="z-10 flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white shadow-md ring-2 ring-white dark:ring-slate-900">
                    <Check className="w-3.5 h-3.5" strokeWidth={4} />
                  </div>
                )}

                {/* 2. NEXT TARGET: Bouncing Gift */}
                {isNextTarget && !isClaimed && (
                  <div className="z-20 relative w-11 h-11 pointer-events-auto drop-shadow-xl filter animate-bounce">
                    {/* Tooltip hint */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded opacity-0 animate-[fadeIn_0.5s_ease-out_1s_forwards]">
                      Goal
                    </div>
                    <Image
                      src="/gift1.png"
                      alt={`Reward at task ${milestoneTaskIndex}`}
                      width={44}
                      height={44}
                      className="object-contain"
                      priority
                    />
                  </div>
                )}

                {/* 3. FUTURE / LOCKED: Lock Node */}
                {!isClaimed && !isNextTarget && (
                  <div className="z-10 flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 ring-2 ring-white dark:ring-slate-900 shadow-inner">
                    {isReached ? (
                       <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />
                    ) : (
                       <Lock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Footer Stats (Remaining) */}
      <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1">
         <span>{Math.round(rate)}% Complete</span>
         {remaining > 0 ? (
           <span>{remaining} Remaining</span>
         ) : (
           <span className="text-green-500">Completed</span>
         )}
      </div>
    </div>
  );
}
