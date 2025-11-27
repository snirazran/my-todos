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
        'rounded-[26px] bg-white/90 backdrop-blur-xl shadow-2xl',
        'ring-1 ring-slate-200/80 dark:bg-slate-900/70 dark:ring-slate-700/70',
        appliedMax,
        'p-2.5 md:p-3',
        'min-h-[100px]',
      ].join(' ')}
    >
      <h2 className="mb-3 font-extrabold tracking-tight text-center text-transparent md:mb-4 bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-600 bg-clip-text dark:from-purple-300 dark:via-indigo-300 dark:to-purple-200">
        {title}
      </h2>

      <div
        ref={listRef}
        className={[
          'flex-1 pr-1 overflow-y-auto transition-colors rounded-xl',
          'no-scrollbar touch-auto overscroll-y-contain',
          // a bit less internal padding now that the global bar exists

          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
