import React from 'react';
import { Lock, Check, Gift } from 'lucide-react';
import { useProgressLogic } from '@/hooks/useProgressLogic';
import { GiftRive } from './gift-box/GiftBox';
import Fly from './fly';

interface ProgressCardProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
  onAddRequested?: () => void;
}

export default function ProgressCard({
  rate,
  done,
  total,
  giftsClaimed = 0,
  onAddRequested,
}: ProgressCardProps) {
  // === LOGIC: REWARD TRACK ===
  const slots = useProgressLogic(done, total, giftsClaimed);

  const allGiftsClaimed = slots.every((s) => s.status === 'CLAIMED');

  // Determine if we're in the "Gold" state (> 50%)
  const isGold = rate > 50;

  return (
    <div className="relative z-10 flex flex-col gap-2 mb-4">
      {/* 2. Main Card */}
      <div
        dir="ltr"
        className="relative py-3 px-4 rounded-[24px] bg-card/80 backdrop-blur-xl border border-border/40 shadow-sm overflow-visible"
      >
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wider uppercase md:text-base text-muted-foreground">
            Daily Goals
          </h2>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black md:text-3xl text-foreground">
              {done}
            </span>
            <span className="text-sm font-bold md:text-lg text-muted-foreground">
              / {total}
            </span>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="relative w-full h-3 mb-4 overflow-hidden rounded-full bg-muted">
          {/* Animated Progress Fill */}
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-700 ease-out rounded-full overflow-hidden
              ${
                isGold
                  ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                  : 'bg-gradient-to-r from-primary to-emerald-400'
              }
            `}
            style={{ width: `${rate}%` }}
          >
            {/* Shimmer effect for Gold state */}
            {isGold && (
              <div
                className="absolute inset-0 w-full h-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.4),transparent)] animate-shimmer"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}
          </div>
        </div>

        {/* Rewards Grid */}
        {!allGiftsClaimed && (
          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot, idx) => {
              const isLocked = slot.status === 'LOCKED';
              const isClaimed = slot.status === 'CLAIMED';
              const isReady = slot.status === 'READY';

              // Common card styles
              const cardBase =
                'relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-all duration-300 min-h-[90px]';

              if (isClaimed) {
                return (
                  <div
                    key={idx}
                    className={`${cardBase} bg-green-50/50 dark:bg-green-900/10 border-green-200/50 dark:border-green-800/30`}
                  >
                    <div className="flex items-center justify-center h-14">
                      <div className="p-3 bg-green-100 rounded-full shadow-sm dark:bg-green-500/20">
                        <Check
                          className="w-5 h-5 text-green-600 dark:text-green-400"
                          strokeWidth={4}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] md:text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wider">
                      Collected
                    </span>
                  </div>
                );
              }

              if (isReady) {
                return (
                  <div
                    key={idx}
                    className={`${cardBase} bg-card border-primary shadow-lg scale-105 z-10`}
                  >
                    <div className="flex items-center justify-center h-14">
                      <div className="relative -top-4">
                        <GiftRive
                          key="milestone-ready"
                          width={90}
                          height={90}
                          isMilestone={true}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] md:text-sm font-black text-primary uppercase animate-pulse">
                      Open!
                    </span>
                  </div>
                );
              }

              if (isLocked) {
                return (
                  <div
                    key={idx}
                    onClick={onAddRequested}
                    className={`${cardBase} bg-muted/30 border-dashed border-2 border-muted-foreground/20 cursor-pointer hover:bg-muted/50 hover:border-muted-foreground/40 group`}
                  >
                    <div className="flex items-center justify-center h-14">
                      <div className="p-2 rounded-full bg-muted border border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                        <Fly size={28} y={-3} />
                      </div>
                    </div>
                    <span className="text-[10px] md:text-[13px] font-bold text-muted-foreground uppercase leading-tight text-center px-1">
                      ADD +{slot.neededToUnlock} Task{slot.neededToUnlock > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              }

              // Pending (Tasks left)
              return (
                <div
                  key={idx}
                  className={`${cardBase} bg-card border-border/60`}
                >
                  <div className="flex items-center justify-center h-14">
                    <div className="relative -top-4">
                      <GiftRive
                        key={`pending-${idx}`}
                        width={90}
                        height={90}
                        isMilestone={true}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] md:text-[13px] font-bold text-foreground">
                      {slot.tasksLeft} Task{slot.tasksLeft > 1 ? 's' : ''} Left
                    </span>
                    {/* Mini Bar */}
                    <div className="w-12 h-1 mt-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full transition-all duration-500 bg-primary"
                        style={{ width: `${slot.percent}%` }}
                      />
                    </div>
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
