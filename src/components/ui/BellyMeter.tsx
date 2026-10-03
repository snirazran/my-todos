import React from 'react';
import { cn } from '@/lib/utils';
import { BellyPip } from './BellyPip';
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
  const tone = getHungerState(percent);
  const { text, label } = tone;
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      aria-label={`Belly ${label.toLowerCase()}, ${Math.round(percent)}% full`}
    >
      {showLabel && (
        <span
          className={cn(
            'shrink-0 text-[12px] font-black',
            text,
          )}
        >
          {label}
        </span>
      )}
      <div className="flex flex-1 items-center gap-1" aria-hidden>
        {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => (
          <BellyPip
            key={i}
            fill={segmentFill(percent, i)}
            tone={tone}
            className="h-2.5"
          />
        ))}
      </div>
    </div>
  );
}

export default BellyMeter;
