'use client';

import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FlameStage = {
  tile: string;
  icon: string;
  glow: string;
  halo: boolean;
};

export function pactFlameStage(weeks: number): FlameStage {
  if (weeks <= 0)
    return {
      tile: 'bg-muted',
      icon: 'text-muted-foreground/50',
      glow: '',
      halo: false,
    };
  if (weeks < 4)
    return {
      tile: 'bg-amber-400/15',
      icon: 'text-amber-500',
      glow: '',
      halo: false,
    };
  if (weeks < 8)
    return {
      tile: 'bg-orange-500/15',
      icon: 'text-orange-500',
      glow: 'shadow-[0_0_20px_-6px_rgba(249,115,22,0.9)]',
      halo: false,
    };
  if (weeks < 12)
    return {
      tile: 'bg-rose-500/15',
      icon: 'text-rose-500',
      glow: 'shadow-[0_0_22px_-5px_rgba(244,63,94,0.95)]',
      halo: true,
    };
  return {
    tile: 'bg-gradient-to-br from-amber-400/25 via-orange-500/20 to-rose-500/25',
    icon: 'text-rose-500',
    glow: 'shadow-[0_0_26px_-4px_rgba(244,63,94,1)]',
    halo: true,
  };
}

export function PactFlameToken({
  weeks,
  className,
}: {
  weeks: number;
  className?: string;
}) {
  const stage = pactFlameStage(weeks);
  return (
    <span
      className={cn(
        'relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl',
        stage.tile,
        stage.glow,
        className,
      )}
    >
      {stage.halo && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse rounded-2xl bg-rose-500/10"
        />
      )}
      <Flame
        className={cn('relative h-7 w-7 fill-current', stage.icon)}
        strokeWidth={2}
      />
      <span
        className={cn(
          'absolute -bottom-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none tabular-nums ring-2 ring-card',
          weeks > 0
            ? 'bg-orange-500 text-white'
            : 'bg-muted-foreground/25 text-muted-foreground',
        )}
      >
        {weeks}
      </span>
    </span>
  );
}

