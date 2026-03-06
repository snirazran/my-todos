import React, { useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { REWARD_SCHEDULE } from '@/lib/dailyRewards';
import { SingleRewardCard } from './RewardCard';
import type { DailyRewardProgress } from '@/lib/types/UserDoc';
import { Crown } from 'lucide-react';

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
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
    <div
      className="w-full relative h-full overflow-y-auto overflow-x-hidden no-scrollbar"
      ref={containerRef}
      style={{ background: 'transparent' }}
    >
      <div className="w-full relative min-h-full flex flex-col">
        {/* ── Sticky Header Tabs ── */}
        <div
          className="sticky top-0 z-50 flex items-stretch h-12 overflow-hidden"
          style={{
            borderBottom: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.08)',
            boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          {/* Basic */}
          <div
            className="w-[50%] flex items-center justify-center"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, #145d29 0%, #0e4120 50%, #145d29 100%)'
                : 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%)',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.9)',
              }}
            >
              Basic
            </span>
          </div>

          {/* Premium — gold shimmer */}
          <div
            className="w-[50%] flex items-center justify-center relative overflow-hidden"
            style={{
              background:
                'linear-gradient(135deg, #b45309 0%, #d97706 50%, #b45309 100%)',
              borderLeft: '2px solid rgba(0,0,0,0.35)',
            }}
          >
            {/* Shimmer sweep */}
            <div
              className="absolute inset-0 animate-shimmer pointer-events-none"
              style={{
                background:
                  'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
              }}
            />
            <span
              className="relative z-10 flex items-center gap-1.5 pr-2"
              style={{
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#fde68a',
                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            >
              <Crown className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
              Premium
            </span>
          </div>
        </div>

        {/* ── Vertical Timeline ── */}
        <div className="relative flex-grow">
          {/* Track */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 z-[1]"
            style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
          />

          {/* Progress fill — glowing green */}
          <div
            className="absolute top-0 left-1/2 w-[2px] -translate-x-1/2 z-[2]"
            style={{
              height: `calc(${progressPct}%)`,
              background:
                'linear-gradient(180deg, #22c55e 0%, #16a34a 70%, #15803d 100%)',
              boxShadow: '0 0 10px 2px rgba(34,197,94,0.45)',
            }}
          />

          {/* Travelling dot at progress tip — hidden, current-day circle is the indicator */}

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
                    'grid grid-cols-[1fr_auto_1fr] items-center transition-all duration-300',
                    isToday ? 'opacity-100 z-20' : 'hover:-translate-y-0.5',
                  )}
                >
                  {/* Today row highlight strip */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 rounded-xl pointer-events-none"
                      style={{
                        top: '-6px',
                        bottom: '-6px',
                        background: isDark
                          ? 'linear-gradient(90deg, rgba(34,197,94,0.07) 0%, rgba(34,197,94,0.12) 50%, rgba(251,191,36,0.07) 100%)'
                          : 'linear-gradient(90deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.15) 50%, rgba(251,191,36,0.08) 100%)',
                        border: isDark
                          ? '1px solid rgba(34,197,94,0.15)'
                          : '1px solid rgba(34,197,94,0.25)',
                      }}
                    />
                  )}

                  {/* Left — Free */}
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

                  {/* Center — Day Marker */}
                  <div className="w-10 flex justify-center relative my-auto">
                    {/* Pulsing ring for today */}
                    {isToday && (
                      <span
                        className="absolute rounded-full animate-ping-ring"
                        style={{
                          width: '2.4rem',
                          height: '2.4rem',
                          background: isDark ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.3)',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    )}
                    <div
                      className={cn(
                        'flex items-center justify-center rounded-full z-10 relative transition-all duration-300',
                        isToday
                          ? 'w-8 h-8'
                          : 'w-6 h-6 border-2',
                      )}
                      style={{
                        background: isToday
                          ? '#19a34a'
                          : progress.claimedDays.includes(dayDef.day)
                            ? (isDark ? '#1a3a28' : '#d1fae5')
                            : (isDark ? '#0f1f17' : '#f0fdf4'),
                        borderColor: isToday
                          ? undefined
                          : progress.claimedDays.includes(dayDef.day)
                            ? (isDark ? '#2a5a3a' : '#86efac')
                            : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
                        boxShadow: isToday
                          ? `0 4px 18px rgba(34,197,94,0.65), 0 0 0 2.5px ${isDark ? '#0a2f17' : '#dcfce7'}`
                          : undefined,
                      }}
                    >
                      <span
                        className={cn(
                          'font-black tracking-tight',
                          isToday
                            ? 'text-[13px] sm:text-sm text-white'
                            : 'text-[11px] sm:text-[12px]',
                        )}
                        style={{
                          color: isToday
                            ? 'white'
                            : progress.claimedDays.includes(dayDef.day)
                              ? (isDark ? 'rgba(255,255,255,0.75)' : '#166534')
                              : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'),
                        }}
                      >
                        {dayDef.day}
                      </span>
                    </div>
                  </div>

                  {/* Right — Premium */}
                  <div className="pl-2 sm:pl-3 flex justify-center w-full relative">
                    {isToday && (
                      <div
                        className="absolute inset-0 rounded-2xl -z-10 scale-110 blur-xl"
                        style={{ background: 'rgba(251,191,36,0.12)' }}
                      />
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
