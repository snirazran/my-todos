'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { WardrobeSlot } from '@/lib/skins/catalog';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Props = {
  width?: number;
  height?: number;
  indices?: Partial<Record<WardrobeSlot, number>>;
  paused?: boolean;
  title?: ReactNode;
  deckWidth?: number;
  deckClassName?: string;
  wrapperClassName?: string;
};

export default function FrogOnDeck({
  deckWidth,
  deckClassName,
  wrapperClassName,
  width = 200,
  height,
  indices,
  paused,
  title,
}: Props) {
  const hasContent = !!title;
  const resolvedDeckWidth =
    deckWidth ??
    (hasContent
      ? Math.max(280, Math.round(width * 1.2))
      : Math.max(160, Math.round(width * 0.95)));

  return (
    <div className={cn('flex flex-col items-center', wrapperClassName)}>
      <div
        className="relative z-50 pointer-events-none"
        style={{ marginBottom: -Math.round(width * 0.18) }}
      >
        <Frog width={width} height={height} indices={indices} paused={paused} />
      </div>
      <div
        className={cn(
          'relative z-10 border-2 border-border/40 bg-background',
          hasContent
            ? 'flex flex-col items-center justify-center rounded-2xl min-h-[72px] py-3 px-6'
            : 'h-3 rounded-full',
          deckClassName,
        )}
        style={{ width: resolvedDeckWidth }}
      >
        {title && (
          <span
            className="text-lg md:text-xl font-black tracking-tight text-foreground text-center leading-tight"
            style={{ letterSpacing: '-0.015em' }}
          >
            {title}
          </span>
        )}
      </div>
    </div>
  );
}
