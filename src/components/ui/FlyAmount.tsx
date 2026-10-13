'use client';

import React from 'react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';

const ICON_TO_TEXT = 1.7;
const ART_PAD_START = 0.22;
const ART_PAD_END = 0.2;
const ART_DROP = 1 / 9;
const GAP_EM = 0.18;

export function flyIconPx(textPx: number) {
  return Math.round(textPx * ICON_TO_TEXT);
}

export function FlyIcon({
  textPx = 14,
  alwaysPlay = false,
  className,
}: {
  textPx?: number;
  alwaysPlay?: boolean;
  className?: string;
}) {
  const size = flyIconPx(textPx);
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{
        height: textPx,
        marginInlineStart: -Math.round(size * ART_PAD_START),
        marginInlineEnd: Math.round(textPx * GAP_EM - size * ART_PAD_END),
      }}
    >
      <Fly
        size={size}
        y={-Math.round(size * ART_DROP)}
        paused={!alwaysPlay}
        alwaysPlay={alwaysPlay}
        interactive={false}
      />
    </span>
  );
}

export function FlyAmount({
  amount,
  size = 14,
  alwaysPlay,
  className,
}: {
  amount: number | React.ReactNode;
  size?: number;
  alwaysPlay?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap tabular-nums',
        className,
      )}
      style={{ fontSize: size }}
    >
      <FlyIcon textPx={size} alwaysPlay={alwaysPlay} />
      {typeof amount === 'number' ? amount.toLocaleString() : amount}
    </span>
  );
}

export function FlyPriceChip({
  amount,
  size = 15,
  className,
}: {
  amount: number | React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-white py-1 pl-2.5 pr-2.5 font-black leading-none text-[#24451f] shadow-[0_1px_0_0_rgba(0,0,0,0.14)]',
        className,
      )}
    >
      <FlyAmount amount={amount} size={size} />
    </span>
  );
}
