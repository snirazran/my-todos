'use client';

import React from 'react';

export default function DayColumn({
  title,
  count,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[65svh] md:max-h-[74svh]', // ⬅ default shorter on mobile
  /** Set true when a composer is open in this column to make it a bit shorter */
  compact = false,
  isToday = false,
}: {
  title: string;
  count?: number;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
  compact?: boolean;
  isToday?: boolean;
}) {
  const appliedMax = compact
    ? 'max-h-[60svh] md:max-h-[70svh]'
    : maxHeightClass;

  // Split "Sunday 7/12" into name and date
  const match = title.match(/^(.*) (\d+\/\d+)$/);
  const displayName = match ? match[1] : title;
  const displayDate = match ? match[2] : null;

  return (
    <section
      className={[
        'group relative flex flex-col overflow-visible',
        'rounded-[20px] bg-card/80 backdrop-blur-2xl',
        'border border-border/50 shadow-sm',
        appliedMax,
        'p-3',
        'min-h-[100px]',
        'transition-colors duration-300 hover:bg-card/90',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-2 mb-4 pt-1">
        <h2 className="text-lg font-black tracking-tight text-foreground uppercase flex items-baseline gap-2">
          {isToday ? (
            <span className="relative z-0 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-primary/20 to-emerald-400/20">
              {displayName}
            </span>
          ) : (
            displayName
          )}
          {displayDate && (
            <span className="text-sm font-bold text-muted-foreground">
              {displayDate}
            </span>
          )}
        </h2>
        {count !== undefined && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold text-muted-foreground">
          {count}
        </span>
        )}
      </div>

      <div
        ref={listRef}
        className={[
          'flex-1 px-2 pt-2 overflow-y-auto transition-colors rounded-xl',
          'no-scrollbar touch-auto overscroll-y-contain',
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
