'use client';

import React from 'react';
import { Lock, CheckCircle2, Gift } from 'lucide-react';
import { useProgressLogic } from '@/hooks/useProgressLogic';
import { GiftRive } from './gift-box/GiftBox';

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
        className="relative py-3 px-4 rounded-[24px] bg-card/80 backdrop-blur-xl border border-border/40 shadow-sm overflow-visible"
      >
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">
            Daily Goals
          </h2>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground">{done}</span>
            <span className="text-sm font-bold text-muted-foreground">
              / {total}
            </span>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="relative w-full h-3 mb-4 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute top-0 left-0 h-full transition-all duration-700 ease-out rounded-full bg-gradient-to-r from-primary to-emerald-400"
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
              const isPending = slot.status === 'PENDING';

              return (
                <div
                  key={idx}
                  className={`
                    relative flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl border transition-all duration-300 min-h-[80px]
                    ${
                      isLocked
                        ? 'bg-muted border-dashed border-border'
                        : isClaimed
                        ? 'bg-green-500/10 border-green-500/30 opacity-70'
                        : isReady
                        ? 'bg-card border-primary shadow-lg scale-105 z-10'
                        : 'bg-card border-border/50 shadow-sm'
                    }
                  `}
                >
                  {/* Centered Icon - Adjusted for visibility */}
                  <div className="relative flex items-center justify-center mb-1 h-14 w-14">
                    {isLocked ? (
                      <Lock className="w-4 h-4 text-muted-foreground/50" />
                    ) : isClaimed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className="relative -top-3">
                        <GiftRive
                          key={
                            isReady ? 'milestone-ready' : 'milestone-pending'
                          }
                          width={96}
                          height={96}
                          isMilestone={isPending}
                          className=""
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
                      <span className="text-[11px] font-black text-primary uppercase animate-pulse">
                        Open!
                      </span>
                    ) : (
                      <div className="flex flex-col w-full gap-1">
                        {/* Text Label */}
                        {isLocked ? (
                          <span className="text-[10px] font-bold text-muted-foreground leading-tight">
                            Add +{slot.neededToUnlock} task
                            {slot.neededToUnlock > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-foreground leading-tight">
                            {slot.tasksLeft} tasks left
                          </span>
                        )}

                        {/* Mini Progress Bar - Narrower Width via Margin */}
                        <div className="h-1 mx-6 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isLocked ? 'bg-muted-foreground/30' : 'bg-primary'
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
