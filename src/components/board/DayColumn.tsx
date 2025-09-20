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
        'group flex flex-col overflow-hidden',
        'rounded-[26px] bg-white/90 backdrop-blur-xl shadow-2xl',
        'ring-1 ring-emerald-700/20 dark:bg-emerald-950/60 dark:ring-emerald-300/10',
        appliedMax,
        'p-2.5 md:p-3',
        'min-h-[100px]',
      ].join(' ')}
    >
      <h2 className="mb-3 font-extrabold tracking-tight text-center text-transparent md:mb-4 bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text dark:from-emerald-300 dark:via-lime-300 dark:to-emerald-200">
        {title}
      </h2>

      <div
        ref={listRef}
        className={[
          'flex-1 pr-1 overflow-y-auto transition-colors rounded-xl',
          'no-scrollbar touch-auto overscroll-y-contain',
          // a bit less internal padding now that the global bar exists
          'pb-12 scroll-pb-12',
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
