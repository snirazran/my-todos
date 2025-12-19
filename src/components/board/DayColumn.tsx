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
        'rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl',
        'border border-white/50 dark:border-slate-800/50 shadow-sm',
        appliedMax,
        'p-3',
        'min-h-[100px]',
        'transition-colors duration-300 hover:bg-white/90 dark:hover:bg-slate-900/80',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-2 mb-4 pt-1">
        <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase flex items-baseline gap-2">
          {isToday ? (
            <span className="relative z-0 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-indigo-200/50 to-purple-200/50 dark:from-indigo-900/50 dark:to-purple-900/50">
              {displayName}
            </span>
          ) : (
            displayName
          )}
          {displayDate && (
            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">
              {displayDate}
            </span>
          )}
        </h2>
        {count !== undefined && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 px-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          {count}
        </span>
        )}
      </div>

      <div
        ref={listRef}
        className={[
          'flex-1 pr-1 overflow-y-auto transition-colors rounded-xl',
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
