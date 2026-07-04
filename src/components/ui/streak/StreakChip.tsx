'use client';

import React from 'react';
import { Flame } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthContext';
import { useLoginStreak, openStreakSheet } from '@/hooks/useLoginStreak';

export function StreakChip({ variant = 'desktop' }: { variant?: 'mobile' | 'desktop' }) {
  const { user } = useAuth();
  const { view, active } = useLoginStreak(!!user);
  if (!user || !active || !view) return null;

  const lit = view.checkedInToday;
  const isMobile = variant === 'mobile';

  return (
    <button
      type="button"
      onClick={() => openStreakSheet()}
      aria-label={`Daily streak: ${view.count} days`}
      className={cn(
        'relative flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border/50 bg-card/80 shadow-sm backdrop-blur-xl transition-colors active:scale-95',
        isMobile ? 'h-[41px] px-3' : 'h-10 px-2.5',
      )}
    >
      <Flame
        className={cn(
          isMobile ? 'h-6 w-6' : 'h-5 w-5',
          lit
            ? 'fill-orange-400 text-orange-500'
            : 'text-muted-foreground/50',
        )}
      />
      <AnimatedNumber
        value={view.count}
        className={cn(
          'text-xs font-black tabular-nums',
          lit ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
    </button>
  );
}
