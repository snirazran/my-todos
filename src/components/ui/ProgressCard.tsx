'use client';

import React from 'react';
import { Lock, CheckCircle2, Gift } from 'lucide-react';
import Image from 'next/image';
import { useProgressLogic } from '@/hooks/useProgressLogic';

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
  const slots = useProgressLogic(done, total, giftsClaimed);

  const allGiftsClaimed = slots.every((s) => s.status === 'CLAIMED');

  return (
    <div className="relative z-10 flex flex-col gap-2 mb-4">
      {/* 2. Main Card */}
      <div
        dir="ltr"
        className="relative py-3 px-4 rounded-[24px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-sm overflow-visible"
      >
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
            Daily Goals
          </h2>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {done}
            </span>
            <span className="text-sm font-bold text-slate-400">/ {total}</span>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="relative w-full h-3 mb-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="absolute top-0 left-0 h-full transition-all duration-700 ease-out rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            style={{ width: `${rate}%` }}
          />
        </div>

        {/* Rewards Grid */}
        {!allGiftsClaimed && (
          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot, idx) => {
              const isLocked = slot.status === 'LOCKED';
              const isClaimed = slot.status === 'CLAIMED';
              const isReady = slot.status === 'READY';

              return (
                <div
                  key={idx}
                  className={`
                    relative flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl border transition-all duration-300 min-h-[80px]
                    ${
                      isLocked
                        ? 'bg-slate-50 dark:bg-slate-800/30 border-dashed border-slate-200/60 dark:border-slate-800/60'
                        : isClaimed
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 opacity-70'
                        : isReady
                        ? 'bg-white dark:bg-slate-800 border-purple-400 dark:border-purple-500 shadow-lg scale-105 z-10'
                        : 'bg-white dark:bg-slate-800 border-white/50 dark:border-slate-800/50 shadow-sm'
                    }
                  `}
                >
                  {/* Centered Icon - Slightly Larger */}
                  <div className="relative flex items-center justify-center mb-1 h-9 w-9">
                    {isLocked ? (
                      <Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    ) : isClaimed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className={isReady ? 'animate-bounce' : ''}>
                        <Image
                          src="/gift1.png"
                          width={32}
                          height={32}
                          alt="Gift"
                          className={
                            isReady ? '' : 'opacity-90 grayscale-[0.2]'
                          }
                        />
                      </div>
                    )}
                  </div>

                  {/* Status & Bar Container */}
                  <div className="w-full px-1 mt-auto text-center">
                    {isClaimed ? (
                      <span className="text-[11px] font-bold text-green-600 dark:text-green-400">
                        Collected
                      </span>
                    ) : isReady ? (
                      <span className="text-[11px] font-black text-purple-600 dark:text-purple-400 uppercase animate-pulse">
                        Open!
                      </span>
                    ) : (
                      <div className="flex flex-col w-full gap-1">
                        {/* Text Label */}
                        {isLocked ? (
                          <span className="text-[10px] font-bold text-slate-400 leading-tight">
                            Add +{slot.neededToUnlock} task
                            {slot.neededToUnlock > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                            {slot.tasksLeft} left
                          </span>
                        )}

                        {/* Mini Progress Bar - Narrower Width via Margin */}
                        <div className="h-1 mx-6 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isLocked
                                ? 'bg-slate-300 dark:bg-slate-600'
                                : 'bg-purple-500'
                            }`}
                            style={{ width: `${slot.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allGiftsClaimed && (
          <div className="flex items-center gap-3 p-3 border border-green-100 bg-green-50 dark:bg-green-900/20 rounded-xl dark:border-green-900/50">
            <div className="p-2 text-green-600 bg-green-100 rounded-full dark:bg-green-800 dark:text-green-300">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800 dark:text-green-200">
                All Gifts Collected!
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                Great work today.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
