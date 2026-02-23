import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { REWARD_SCHEDULE } from '@/lib/dailyRewards';
import { SingleRewardCard } from './RewardCard';
import type { DailyRewardProgress } from '@/lib/types/UserDoc';
import { Crown } from 'lucide-react';

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

  // Auto-scroll to current day on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const scrollContainer = containerRef.current;
      if (!scrollContainer) return;

      const targetNode = scrollContainer.querySelector(
        `[data-day="${currentDay}"]`,
      ) as HTMLElement;

      if (targetNode) {
        // Calculate offset to center vertically
        const containerHeight = scrollContainer.clientHeight;
        const targetTop = targetNode.offsetTop;
        const targetHeight = targetNode.offsetHeight;
        const scrollPos = targetTop - containerHeight / 2 + targetHeight / 2;

        scrollContainer.scrollTo({
          top: Math.max(0, scrollPos),
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
    <div
      className="w-full relative h-full overflow-y-auto overflow-x-hidden no-scrollbar"
      ref={containerRef}
    >
      {/* Container without Card Box */}
      <div className="w-full relative pb-16 min-h-full flex flex-col">
        {/* Split Background Layers */}
        <div className="absolute inset-y-0 left-0 w-[50%] bg-[#F8F9F8] dark:bg-muted/30" />
        <div className="absolute inset-y-0 right-0 w-[50%] bg-[#FFF6E8] dark:bg-amber-900/10" />

        {/* Sticky Header Tabs */}
        <div className="sticky top-0 z-50 flex items-stretch border-t border-b border-border/40 bg-background h-12 shadow-sm">
          {/* Basic Header */}
          <div className="w-[50%] bg-[#F4F5F4] dark:bg-muted/80 flex items-center justify-center relative">
            <span className="text-[11px] sm:text-[12px] font-black text-muted-foreground uppercase tracking-widest pl-2">
              Basic
            </span>
          </div>

          {/* Premium Header */}
          <div className="w-[50%] bg-amber-400 dark:bg-amber-500 flex items-center justify-center border-l-2 border-background shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.1)] relative">
            <span className="text-[11px] sm:text-[12px] font-black text-white dark:text-amber-950 uppercase tracking-widest flex items-center justify-center gap-1.5 pr-2">
              <Crown className="w-3.5 h-3.5 shrink-0" strokeWidth={3} /> Premium
            </span>
          </div>
        </div>

        {/* Vertical Timeline Structure */}
        <div className="relative flex-grow">
          {/* Central Vertical Line Background */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 bg-border/40" />

          {/* Central Vertical Line Glow / Progress effect for past/current days */}
          <div
            className="absolute top-0 left-1/2 w-[2px] -translate-x-1/2 bg-[#22a06b] dark:bg-primary"
            style={{
              height: `calc(${((currentDay - 0.5) / REWARD_SCHEDULE.length) * 100}%)`,
            }}
          />

          <div className="flex flex-col gap-y-6 sm:gap-y-8 relative z-10 w-full px-2 sm:px-3 pt-3 pb-6">
            {REWARD_SCHEDULE.map((dayDef) => {
              const freeStatus = getStatus(dayDef.day, false);
              const premiumStatus = getStatus(dayDef.day, true);
              const isToday = dayDef.day === currentDay;

              return (
                <div
                  key={`day-${dayDef.day}`}
                  data-day={dayDef.day}
                  className={cn(
                    'grid grid-cols-[1fr_auto_1fr] items-center group transition-opacity duration-500',
                    isToday
                      ? 'opacity-100 z-20'
                      : 'opacity-95 hover:opacity-100',
                  )}
                >
                  {/* Left Column (Free) */}
                  <div className="pr-2 sm:pr-3 flex justify-center w-full">
                    <div className="w-full max-w-[140px] sm:max-w-[160px]">
                      <SingleRewardCard
                        day={dayDef.day}
                        rewardType={dayDef.free.type}
                        amount={dayDef.free.amount}
                        itemId={dayDef.free.itemId}
                        status={freeStatus}
                        isToday={isToday}
                        hideDayLabel={true}
                        onClick={
                          isToday && freeStatus === 'READY'
                            ? () => onClaim(dayDef.day)
                            : undefined
                        }
                      />
                    </div>
                  </div>

                  {/* Center Column (Timeline Marker) */}
                  <div className="w-8 flex justify-center relative my-auto">
                    <div
                      className={cn(
                        'flex items-center justify-center rounded-full border-2 transition-colors duration-300 z-10',
                        isToday
                          ? 'w-8 h-8 sm:w-9 sm:h-9 bg-primary border-background text-primary-foreground shadow-lg shadow-primary/30'
                          : progress.claimedDays.includes(dayDef.day)
                            ? 'w-6 h-6 sm:w-7 sm:h-7 bg-muted-foreground border-background text-background'
                            : 'w-6 h-6 sm:w-7 sm:h-7 bg-card border-border text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'font-black tracking-tight',
                          isToday
                            ? 'text-[13px] sm:text-sm'
                            : 'text-[11px] sm:text-[12px]',
                        )}
                      >
                        {dayDef.day}
                      </span>
                    </div>
                  </div>

                  {/* Right Column (Premium) */}
                  <div className="pl-2 sm:pl-3 flex justify-center w-full relative">
                    {/* Soft highlight behind premium item if it's today */}
                    {isToday && (
                      <div className="absolute inset-0 bg-amber-500/10 dark:bg-amber-500/15 rounded-2xl -z-10 scale-110 blur-xl" />
                    )}
                    <div className="w-full max-w-[140px] sm:max-w-[160px]">
                      <SingleRewardCard
                        day={dayDef.day}
                        rewardType={dayDef.premium.type}
                        amount={dayDef.premium.amount}
                        itemId={dayDef.premium.itemId}
                        status={premiumStatus}
                        isPremiumTier={true}
                        isToday={isToday}
                        hideDayLabel={true}
                        onClick={
                          !isPremium
                            ? onGoPremium
                            : isToday && premiumStatus === 'READY'
                              ? () => onClaim(dayDef.day)
                              : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
