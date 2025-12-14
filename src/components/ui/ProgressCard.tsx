'use client';

import React from 'react';
import { Sparkles, Check, PartyPopper } from 'lucide-react';
import { GiftRive } from './gift-box/GiftBox';
import { cn } from '@/lib/utils';

interface ProgressCardProps {
  rate: number; // percentage complete
  done: number; // current active tasks done
  total: number; // total tasks
  earnedToday?: number; // total rewards earned today (high water mark)
}

export default function ProgressCard({ rate, done, total, earnedToday = 0 }: ProgressCardProps) {
  // Dynamic Milestones Logic
  let milestones: number[] = [];
  if (total > 0) {
    if (total <= 3) {
      milestones = Array.from({ length: total }, (_, i) => i + 1);
    } else {
      milestones = [
        Math.ceil(total * 0.33),
        Math.ceil(total * 0.66),
        total
      ];
    }
  }
  // Deduplicate
  milestones = [...new Set(milestones)];

  // Progress relative to TOTAL tasks
  const maxVal = Math.max(total, 1);
  const progressPercent = Math.min(100, (done / maxVal) * 100);

  // Text Logic
  const allDone = done >= total && total > 0;
  // Next milestone is one that is NOT claimed yet.
  // We use the same definition of 'isClaimed' as the visual logic: (earnedToday >= m) || (done >= m)
  const nextMilestone = milestones.find(m => !((earnedToday >= m) || (done >= m)));
  const tasksToNext = nextMilestone ? nextMilestone - done : 0;

  return (
    <div
      dir="ltr"
      className="z-10 p-6 mb-6 rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
            {allDone ? <PartyPopper className="w-6 h-6 text-yellow-500" /> : <Sparkles className="w-6 h-6 text-purple-500" />}
            {allDone ? "Amazing Job!" : "Today's Quest"}
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
             {allDone 
               ? "You've crushed all your tasks!" 
               : "Complete tasks to unlock daily gifts!"}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-black text-slate-900 dark:text-white">
            {done}<span className="text-lg text-slate-400">/{total}</span>
          </span>
        </div>
      </div>

      <div className="relative w-full h-14 mb-4 select-none">
        {/* Track Background */}
        <div className="absolute top-[28px] left-0 w-full h-4 -mt-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700/50">
          {/* Fill */}
          <div
            className="h-full transition-all duration-700 ease-out bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Milestones */}
        {milestones.map((m, i) => {
          // A milestone is claimed if we ever reached it today (earnedToday >= m)
          // OR if we are currently there (done >= m) - failsafe.
          // Ideally earnedToday should cover it.
          const isClaimed = (earnedToday >= m) || (done >= m);
          // Visual Position: Evenly spaced based on how many milestones we have
          const pct = ((i + 1) / milestones.length) * 100;
          
          return (
            <div
              key={m}
              className="absolute top-[14px] -translate-y-1/2 flex flex-col items-center group transition-all duration-500"
              style={{ 
                left: `${pct}%`, 
                transform: `translate(-${pct >= 95 ? '100%' : '50%'}, -50%)` 
              }} 
            >
              {/* Gift Icon */}
              <div
                className={cn(
                  "relative w-14 h-14 transition-all duration-500 flex items-center justify-center",
                  isClaimed
                    ? "opacity-100 scale-100" 
                    : "opacity-40 grayscale scale-90 hover:scale-95 hover:opacity-60"
                )}
              >
                <div className="w-full h-full drop-shadow-sm">
                    <GiftRive />
                </div>
                
                {/* Claimed Badge */}
                {isClaimed && (
                  <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 bg-emerald-500 rounded-full border-[2px] border-white dark:border-slate-900 shadow-sm animate-in zoom-in duration-300">
                    <Check className="w-3 h-3 text-white stroke-[4]" />
                  </div>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "absolute top-full mt-1 text-[10px] font-extrabold uppercase tracking-wider transition-all px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm",
                  isClaimed 
                    ? "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800" 
                    : "text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                )}
              >
                {isClaimed ? 'Claimed' : `${m} Tasks`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Motivational Footer */}
      {!allDone && (
        <div className="flex justify-center items-center mt-2 pt-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest animate-pulse">
                {tasksToNext > 0 ? `${tasksToNext} more for next gift!` : "Almost there!"}
            </p>
        </div>
      )}
    </div>
  );
}