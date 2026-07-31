import React from 'react';
import { cn } from '@/lib/utils';
import {
  HUNGER_SEGMENTS,
  getHungerState,
  segmentFill,
} from '@/lib/hungerDisplay';

/**
 * The frog's belly as the six fly-meal pips used on the home hero, minus the
 * feeding choreography — for places that report the belly rather than animate
 * it. Same segments, same colours, so a belly reads identically everywhere.
 */
export function BellyMeter({
  percent,
  showLabel = true,
  className,
}: {
  /** Fullness, 0–100. */
  percent: number;
  showLabel?: boolean;
  className?: string;
}) {
  const { bg, text, label } = getHungerState(percent);
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      aria-label={`Belly ${label.toLowerCase()}, ${Math.round(percent)}% full`}
    >
      {showLabel && (
        <span
          className={cn(
            'shrink-0 text-[10px] font-black uppercase tracking-[0.08em]',
            text,
          )}
        >
          {label}
        </span>
      )}
      <div className="flex flex-1 items-center gap-1" aria-hidden>
        {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
                bg,
              )}
              style={{ width: `${segmentFill(percent, i) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default BellyMeter;
