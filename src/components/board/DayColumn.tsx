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
      dir="rtl"
      className={[
        'group flex flex-col',
        'bg-white/90 dark:bg-slate-800/90',
        'rounded-2xl shadow border border-slate-200/70 dark:border-slate-700/60',
        maxHeightClass,
        'p-1.5',
        // keep a small min so empty days still look clickable
        'min-h-[100px] md:min-h-[100px]',
        // prevent the column itself from overflowing; list will scroll
        'overflow-hidden',
      ].join(' ')}
    >
      <h2 className="mb-3 font-semibold text-center md:mb-4 text-slate-900 dark:text-white">
        {title}
      </h2>

      {/* Scrollable list area */}
      <div
        ref={listRef}
        className={[
          'flex-1 overflow-y-auto pr-1 rounded-xl transition-colors',
          'no-scrollbar',
          // ⬇️ Was: 'touch-pan-y'. Allow both axes so horizontal swipes work from tasks.
          'touch-auto',
          'overscroll-y-contain',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
