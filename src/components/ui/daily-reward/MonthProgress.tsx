import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { REWARD_SCHEDULE } from '@/lib/dailyRewards';
import { SingleRewardCard } from './RewardCard';
import type { DailyRewardProgress } from '@/lib/types/UserDoc';
import { Check, Crown, Gift } from 'lucide-react';

interface MonthProgressProps {
  progress: DailyRewardProgress;
  onClaim: (day: number) => void;
  currentDay: number;
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const target = el.querySelector(
        `[data-day="${currentDay}"]`,
      ) as HTMLElement;
      if (target) {
        const scrollPos =
          target.offsetTop - el.clientHeight / 2 + target.offsetHeight / 2;
        el.scrollTo({ top: Math.max(0, scrollPos), behavior: 'smooth' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentDay]);

  const getStatus = (day: number, isPremiumRow: boolean) => {
    const isToday = day === currentDay;
    const isPast = day < currentDay;
    const isClaimed = progress.claimedDays.includes(day);
    if (isPremiumRow && !isPremium) {
      return isPast ? 'MISSED' : 'LOCKED_PREMIUM';
    }
    if (isClaimed) return 'CLAIMED';
    if (isToday) return 'READY';
    if (isPast) return 'MISSED';
    return 'LOCKED';
  };

  const progressPct = ((currentDay - 0.5) / REWARD_SCHEDULE.length) * 100;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-border/50 bg-card/80 shadow-sm backdrop-blur-2xl">
      <div className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-border/50 bg-card/95 px-2 backdrop-blur-2xl">
        <TierHeader icon={<Gift className="w-4 h-4" />} label="Free" />
        <div className="w-10" />
        <TierHeader
          icon={<Crown className="w-4 h-4" />}
          label="Premium"
          premium
        />
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden px-2 pb-5 pt-4 no-scrollbar sm:px-3"
      >
        <div className="relative min-h-full">
          <div className="absolute bottom-0 left-1/2 top-0 z-0 w-2 -translate-x-1/2 rounded-full bg-muted/50 shadow-inner" />
          <div
            className="absolute left-1/2 top-0 z-0 w-1 -translate-x-1/2 rounded-full bg-primary/70 shadow-[0_0_14px_rgba(34,197,94,0.28)]"
            style={{ height: `calc(${progressPct}%)` }}
          />

          <div className="relative z-10 flex flex-col gap-y-5 sm:gap-y-6">
          {REWARD_SCHEDULE.map((dayDef) => {
            const freeStatus = getStatus(dayDef.day, false);
            const premiumStatus = getStatus(dayDef.day, true);
            const isToday = dayDef.day === currentDay;
            const isClaimed = progress.claimedDays.includes(dayDef.day);

            return (
              <div
                key={`day-${dayDef.day}`}
                data-day={dayDef.day}
                className={cn(
                  'relative grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center rounded-2xl px-1 py-2 transition-all duration-300 sm:px-2',
                  isToday
                    ? 'bg-primary/10 ring-1 ring-primary/20 shadow-sm'
                    : '',
                )}
              >
                <div className="flex w-full justify-center pr-2 sm:pr-3">
                  <div className="w-full max-w-[132px] sm:max-w-[160px]">
                    <SingleRewardCard
                      day={dayDef.day}
                      rewardType={dayDef.free.type}
                      amount={dayDef.free.amount}
                      itemId={dayDef.free.itemId}
                      status={freeStatus}
                      isToday={isToday}
                      hideDayLabel
                      deferPreview
                      previewDelayMs={180 + (dayDef.day % 4) * 90}
                      onClick={
                        isToday && freeStatus === 'READY'
                          ? () => onClaim(dayDef.day)
                          : undefined
                      }
                    />
                  </div>
                </div>

                <div className="relative z-20 flex justify-center">
                  {isToday && (
                    <span className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 animate-ping-ring" />
                  )}
                  <div className="relative z-10 rounded-full bg-card p-1 shadow-sm ring-1 ring-border/70">
                    <div
                      className={cn(
                        'flex items-center justify-center rounded-full border font-black tabular-nums',
                        isToday
                          ? 'h-8 w-8 border-primary bg-primary text-primary-foreground text-sm shadow-sm shadow-primary/25'
                          : isClaimed
                            ? 'h-6 w-6 border-primary/30 bg-primary/10 text-primary text-[11px]'
                            : 'h-6 w-6 border-border bg-background text-muted-foreground text-[11px]',
                      )}
                    >
                      {isClaimed && !isToday ? (
                        <Check className="w-3.5 h-3.5 stroke-[4]" />
                      ) : (
                        dayDef.day
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex w-full justify-center pl-2 sm:pl-3">
                  <div className="w-full max-w-[132px] sm:max-w-[160px]">
                    <SingleRewardCard
                      day={dayDef.day}
                      rewardType={dayDef.premium.type}
                      amount={dayDef.premium.amount}
                      itemId={dayDef.premium.itemId}
                      status={premiumStatus}
                      isPremiumTier
                      isToday={isToday}
                      hideDayLabel
                      deferPreview
                      previewDelayMs={240 + (dayDef.day % 4) * 90}
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

function TierHeader({
  icon,
  label,
  premium = false,
}: {
  icon: React.ReactNode;
  label: string;
  premium?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-2xl border text-[11px] font-black uppercase tracking-widest',
        premium
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-primary/20 bg-primary/10 text-primary',
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
