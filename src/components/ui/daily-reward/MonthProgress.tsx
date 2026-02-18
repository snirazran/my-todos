import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { REWARD_SCHEDULE } from '@/lib/dailyRewards';
import { SingleRewardCard } from './RewardCard';
import type { DailyRewardProgress } from '@/lib/types/UserDoc';
import { Crown } from 'lucide-react';
import { useDraggableScroll } from '@/hooks/useDraggableScroll';

interface MonthProgressProps {
  progress: DailyRewardProgress;
  onClaim: (day: number) => void;
  currentDay: number; // 1-31
  isPremium: boolean;
  onGoPremium?: () => void;
}

export function MonthProgress({
  progress,
  onClaim,
  currentDay,
  isPremium,
  onGoPremium,
}: MonthProgressProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDraggableScroll(containerRef);

  // Auto-scroll to current day on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const scrollContainer = containerRef.current;
      if (!scrollContainer) return;

      // Find the today element (in either row, they align)
      // We can infer position from the index
      const dayIndex = currentDay - 1;
      // Assuming cards are consistent width + gap.
      // But better to find the actual node.
      // Let's look for a data attribute or class we can target?
      // Or just querySelector.
      const targetNode = scrollContainer.querySelector(
        `[data-day="${currentDay}"]`,
      ) as HTMLElement;

      if (targetNode) {
        const containerWidth = scrollContainer.clientWidth;
        const targetLeft = targetNode.offsetLeft;
        const targetWidth = targetNode.offsetWidth;
        const scrollPos = targetLeft - containerWidth / 2 + targetWidth / 2;

        scrollContainer.scrollTo({
          left: Math.max(0, scrollPos),
          behavior: 'smooth',
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentDay]);

  const getStatus = (day: number, isPremiumRow: boolean) => {
    const isToday = day === currentDay;
    const isPast = day < currentDay;
    const isClaimed = progress.claimedDays.includes(day);

    if (isPremiumRow && !isPremium) {
      if (isPast) return 'MISSED';
      return 'LOCKED_PREMIUM';
    }

    if (isClaimed) return 'CLAIMED';
    if (isToday) return 'READY';
    if (isPast) return 'MISSED';
    return 'LOCKED';
  };

  return (
    <div className="w-full relative">
      {/* Single shared scroll container */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto pb-4 pt-1 px-4 no-scrollbar"
      >
        <div className="flex flex-col gap-6 min-w-max">
          {/* ─── PREMIUM ROW ─── */}
          <div className="relative pt-8">
            {/* Track Background - Full Width */}
            <div className="absolute top-[calc(50%+16px)] left-0 right-0 h-3 -translate-y-1/2 bg-amber-100/50 dark:bg-amber-900/10 border-y border-amber-200/30 dark:border-amber-800/20 rounded-full" />

            {/* Sticky Header Badge */}
            <div className="absolute top-0 left-0 sticky z-10 inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/80 dark:to-orange-900/80 border border-amber-200 dark:border-amber-700/50 rounded-full shadow-sm backdrop-blur-sm">
              <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
              <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Premium
              </span>
            </div>

            <div className="flex gap-4 relative z-0">
              {REWARD_SCHEDULE.map((dayDef) => (
                <div key={`prem-${dayDef.day}`} data-day={dayDef.day}>
                  <SingleRewardCard
                    day={dayDef.day}
                    rewardType={dayDef.premium.type}
                    amount={dayDef.premium.amount}
                    itemId={dayDef.premium.itemId}
                    status={getStatus(dayDef.day, true)}
                    isPremiumTier={true}
                    isToday={dayDef.day === currentDay}
                    onClick={
                      !isPremium
                        ? onGoPremium
                        : dayDef.day === currentDay
                          ? () => onClaim(dayDef.day)
                          : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ─── FREE ROW ─── */}
          <div className="relative pt-8">
            {/* Track Background */}
            <div className="absolute top-[calc(50%+16px)] left-0 right-0 h-3 -translate-y-1/2 bg-gray-100 dark:bg-gray-800/40 border-y border-gray-200 dark:border-gray-700/40 rounded-full" />

            {/* Sticky Header Badge */}
            <div className="absolute top-0 left-0 sticky z-10 inline-flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border border-border rounded-full shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Free Tier
              </span>
            </div>

            <div className="flex gap-4 relative z-0">
              {REWARD_SCHEDULE.map((dayDef) => (
                <div key={`free-${dayDef.day}`} data-day={dayDef.day}>
                  <SingleRewardCard
                    day={dayDef.day}
                    rewardType={dayDef.free.type}
                    amount={dayDef.free.amount}
                    itemId={dayDef.free.itemId}
                    status={getStatus(dayDef.day, false)}
                    isToday={dayDef.day === currentDay}
                    onClick={
                      dayDef.day === currentDay
                        ? () => onClaim(dayDef.day)
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
