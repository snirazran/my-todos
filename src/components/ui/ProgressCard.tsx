'use client';

import React from 'react';
import { Sparkles, Check } from 'lucide-react';
import Image from 'next/image';

interface ProgressCardProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number; // <--- NEW PROP
}

export default function ProgressCard({
  rate,
  done,
  total,
  giftsClaimed = 0, // Default to 0
}: ProgressCardProps) {
  const safeTotal = Math.max(1, total);

  // === LOGIC ===
  const getMilestones = (t: number) => {
    if (t === 0) return [];
    let giftsAllowed = 3;
    if (t <= 2) giftsAllowed = 1;
    else if (t <= 5) giftsAllowed = 2;
    else giftsAllowed = 3;

    const results: number[] = [];
    for (let i = 1; i <= giftsAllowed; i++) {
      results.push(Math.round((i * t) / giftsAllowed));
    }
    return Array.from(new Set(results)).sort((a, b) => a - b);
  };

  const milestones = getMilestones(total);

  return (
    <div
      dir="ltr"
      className="z-10 p-6 mb-6 rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
          <Sparkles className="w-6 h-6 text-purple-500" />
          Your progress today
        </h2>
        <span className="text-3xl font-bold text-slate-900 dark:text-white">
          {Math.round(rate)}%
        </span>
      </div>

      <div className="relative w-full h-12 mt-8 overflow-visible select-none">
        {/* Track Background */}
        <div className="absolute left-0 w-full h-3 -translate-y-1/2 rounded-full top-1/2 bg-slate-200 dark:bg-slate-700" />

        {/* Track Fill */}
        <div
          className="absolute top-1/2 left-0 h-3 -translate-y-1/2 rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500 shadow-[0_0_12px_rgba(124,58,237,0.45)]"
          style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
        />

        {/* Gifts Overlay */}
        <div className="absolute top-0 left-0 z-50 w-full h-full pointer-events-none">
          {milestones.map((milestoneTaskIndex, index) => {
            // LOGIC UPDATE:
            // 1. A gift is "reached" if we have done enough tasks.
            const isReached = done >= milestoneTaskIndex;

            // 2. A gift is "claimed" (green check) if the index (0, 1, or 2) is less than the count of gifts we have in the DB.
            const isClaimed = index < giftsClaimed;

            // Calculate percentage position
            const pct = (milestoneTaskIndex / safeTotal) * 100;
            const leftPos = `${pct}%`;

            return (
              <div
                key={milestoneTaskIndex}
                className="absolute flex items-center justify-center w-10 h-10 transition-all duration-500 -translate-y-1/2 pointer-events-auto top-1/2"
                style={{ left: leftPos, transform: 'translate(-50%, -50%)' }}
              >
                <div className="relative flex items-center justify-center w-full h-full group">
                  <div
                    className={`transition-all duration-500 w-full h-full flex items-center justify-center ${
                      isReached
                        ? 'scale-125 drop-shadow-lg brightness-110'
                        : 'scale-90 opacity-50 grayscale'
                    }`}
                  >
                    <Image
                      src="/gift1.png"
                      alt={`Reward at task ${milestoneTaskIndex}`}
                      width={40}
                      height={40}
                      className="object-contain"
                      priority
                    />
                  </div>

                  {/* Render Checkmark ONLY if specifically claimed in DB */}
                  {isClaimed && (
                    <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-white dark:border-slate-900 shadow-sm z-10">
                      <Check className="w-2.5 h-2.5" strokeWidth={4} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-sm font-medium text-center text-slate-600 dark:text-slate-400">
        Completed{' '}
        <span className="font-bold text-slate-900 dark:text-white">{done}</span>{' '}
        of {total} tasks
      </p>
    </div>
  );
}
