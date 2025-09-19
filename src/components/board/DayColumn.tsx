'use client';

import React from 'react';

export default function DayColumn({
  title,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[80svh]',
}: {
  title: string;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
}) {
  return (
    <section
      className={[
        'group flex flex-col overflow-hidden',
        'rounded-[26px] bg-white/90 backdrop-blur-xl shadow-2xl',
        'ring-1 ring-emerald-700/20 dark:bg-emerald-950/60 dark:ring-emerald-300/10',
        maxHeightClass,
        'p-2.5 md:p-3',
        'min-h-[100px]',
      ].join(' ')}
    >
      <h2 className="mb-3 font-extrabold tracking-tight text-center text-transparent md:mb-4 bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text dark:from-emerald-300 dark:via-lime-300 dark:to-emerald-200">
        {title}
      </h2>

      <div
        ref={listRef}
        className="flex-1 pr-1 overflow-y-auto transition-colors rounded-xl no-scrollbar touch-auto overscroll-y-contain"
      >
        {children}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
