'use client';

import React from 'react';

export default function DayColumn({
  title,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[74svh]', // ⬅ default a bit shorter
  /** Set true when a composer is open in this column to make it a bit shorter */
  compact = false,
}: {
  title: string;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
  compact?: boolean;
}) {
  const appliedMax = compact ? 'max-h-[70svh]' : maxHeightClass;

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
        <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase">
          {title}
        </h2>
        {/* Could add a badge here for count later */}
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
