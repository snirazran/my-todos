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
  const scrollToDay = (containerRef: React.RefObject<HTMLDivElement>) => {
    if (containerRef.current) {
      const container = containerRef.current;
      const scrollContainer = container.firstElementChild as HTMLElement;
      if (!scrollContainer || !scrollContainer.children.length) return;

      const targetNode = scrollContainer.children[
        currentDay - 1
      ] as HTMLElement;

      if (targetNode) {
        const containerWidth = container.clientWidth;
        const targetLeft = targetNode.offsetLeft;
        const targetWidth = targetNode.offsetWidth;

        const scrollPos = targetLeft - containerWidth / 2 + targetWidth / 2;

        container.scrollTo({
          left: Math.max(0, scrollPos),
          behavior: 'auto', // Instant scroll to avoid conflicts
        });
      }
    }
  };

  // Auto-scroll to current day on mount/change
  useEffect(() => {
    // Wait for modal animation to complete (approx 300-400ms)
    const timer = setTimeout(() => {
      scrollToDay(premiumRef);
      // Sync logic will handle scrolling the freeRef
    }, 400);
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
    <div className="w-full space-y-8 px-2">
      <div className="space-y-4">
        {/* ─── PREMIUM ROW ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2">
            <div className="p-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Crown
                className="w-4 h-4 text-amber-600 dark:text-amber-500"
                fill="currentColor"
              />
            </div>
            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider">
              Premium Tier
            </h3>
          </div>

          <div
            ref={premiumRef}
            onScroll={() => handleScroll('premium')}
            className="w-full overflow-x-auto pb-4 px-2 flex gap-3 snap-none no-scrollbar"
          >
            <div className="flex gap-3 min-w-max relative">
              {REWARD_SCHEDULE.map((dayDef) => (
                <SingleRewardCard
                  key={`prem-${dayDef.day}`}
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
              ))}
            </div>
          </div>
        </div>

        {/* ─── FREE ROW ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2">
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Free Tier
            </span>
          </div>
          <div
            ref={freeRef}
            onScroll={() => handleScroll('free')}
            className="w-full overflow-x-auto pb-4 px-2 flex gap-3 snap-none no-scrollbar"
          >
            <div className="flex gap-3 min-w-max relative">
              {REWARD_SCHEDULE.map((dayDef) => (
                <SingleRewardCard
                  key={`free-${dayDef.day}`}
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
