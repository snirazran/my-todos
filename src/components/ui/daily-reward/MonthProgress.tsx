import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { type DailyRewardDef, REWARD_SCHEDULE } from '@/lib/dailyRewards';
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

import { useDraggableScroll } from '@/hooks/useDraggableScroll';

export function MonthProgress({
  progress,
  onClaim,
  currentDay,
  isPremium,
  onGoPremium,
}: MonthProgressProps) {
  const premiumRef = useRef<HTMLDivElement>(null);
  const freeRef = useRef<HTMLDivElement>(null);

  useDraggableScroll(premiumRef);
  useDraggableScroll(freeRef);

  // Sync scrolling logic
  const isSyncing = useRef(false);

  const handleScroll = (source: 'premium' | 'free') => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const prem = premiumRef.current;
    const free = freeRef.current;

    if (prem && free) {
      if (source === 'premium') {
        free.scrollLeft = prem.scrollLeft;
      } else {
        prem.scrollLeft = free.scrollLeft;
      }
    }

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  // Auto-scroll function
  const scrollToDay = (container: HTMLDivElement) => {
    const scrollContainer = container.firstElementChild as HTMLElement;
    if (!scrollContainer || !scrollContainer.children.length) return;

    const targetNode = scrollContainer.children[currentDay - 1] as HTMLElement;

    if (targetNode) {
      const containerWidth = container.clientWidth;
      const targetLeft = targetNode.offsetLeft;
      const targetWidth = targetNode.offsetWidth;

      const scrollPos = targetLeft - containerWidth / 2 + targetWidth / 2;

      container.scrollTo({
        left: Math.max(0, scrollPos),
        behavior: 'smooth',
      });
    }
  };

  // Auto-scroll to current day on mount/change
  useEffect(() => {
    const timer = setTimeout(() => {
      // Temporarily disable sync to prevent conflicts during smooth scroll
      isSyncing.current = true;

      if (premiumRef.current) scrollToDay(premiumRef.current);
      if (freeRef.current) scrollToDay(freeRef.current);

      // Re-enable sync after smooth scroll completes (~500ms)
      setTimeout(() => {
        isSyncing.current = false;
      }, 600);
    }, 700);
    return () => clearTimeout(timer);
  }, [currentDay]);

  const getStatus = (day: number, isPremiumRow: boolean) => {
    const isToday = day === currentDay;
    const isPast = day < currentDay;
    const isClaimed = progress.claimedDays.includes(day);

    // If it's a premium row but user is NOT premium
    if (isPremiumRow && !isPremium) {
      if (isPast) return 'MISSED';
      return 'LOCKED_PREMIUM';
    }

    if (isClaimed) return 'CLAIMED';
    if (isToday) return 'READY';
    if (isPast) return 'MISSED'; // Or 'LOCKED' if we allow claiming past
    return 'LOCKED';
  };

  return (
    <div className="w-full flex flex-col gap-6 relative">
      <div>
        {/* ─── PREMIUM ROW ─── */}
        <div className="relative">
          {/* Premium Track Background */}
          <div className="absolute top-1/2 left-0 right-0 h-3 -translate-y-1/2 bg-amber-100/50 dark:bg-amber-900/10 border-y border-amber-200/30 dark:border-amber-800/20" />

          {/* Header Badge (Floating) */}
          <div className="sticky left-4 z-10 mb-3 inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/80 dark:to-orange-900/80 border border-amber-200 dark:border-amber-700/50 rounded-full shadow-sm backdrop-blur-sm">
            <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
            <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              Premium
            </span>
          </div>

          <div
            ref={premiumRef}
            onScroll={() => handleScroll('premium')}
            className="w-full overflow-x-auto pb-4 pt-1 px-4 flex gap-4 snap-x snap-mandatory no-scrollbar"
          >
            <div className="flex gap-4 min-w-max relative py-2">
              {REWARD_SCHEDULE.map((dayDef) => (
                <div key={`prem-${dayDef.day}`} className="snap-center">
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
        </div>

        {/* ─── FREE ROW ─── */}
        <div className="relative mt-2">
          {/* Free Track Background */}
          <div className="absolute top-1/2 left-0 right-0 h-3 -translate-y-1/2 bg-gray-100 dark:bg-gray-800/40 border-y border-gray-200 dark:border-gray-700/40" />

          {/* Header Badge */}
          <div className="sticky left-4 z-10 mb-3 inline-flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border border-border rounded-full shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Free Tier
            </span>
          </div>

          <div
            ref={freeRef}
            onScroll={() => handleScroll('free')}
            className="w-full overflow-x-auto pb-4 pt-1 px-4 flex gap-4 snap-x snap-mandatory no-scrollbar"
          >
            <div className="flex gap-4 min-w-max relative py-2">
              {REWARD_SCHEDULE.map((dayDef) => (
                <div key={`free-${dayDef.day}`} className="snap-center">
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
