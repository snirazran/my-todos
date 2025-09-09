// DayColumn.tsx
'use client';

import React from 'react';

export default function DayColumn({
  title,
  listRef,
  children,
  footer,
  heightClass = 'h-full',
}: {
  title: string;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** exact height for the column container (e.g., 'h-full') */
  heightClass?: string;
}) {
  return (
    <section
      dir="rtl"
      className={[
        'group flex flex-col',
        'bg-white/90 dark:bg-slate-800/90',
        'rounded-2xl shadow border border-slate-200/70 dark:border-slate-700/60',
        // ⬇️ exact height + allow children to shrink
        heightClass,
        'min-h-0',
        'p-3 md:p-4',
        'md:min-h-[100px]',
      ].join(' ')}
    >
      <h2 className="mb-3 font-semibold text-center md:mb-4 text-slate-900 dark:text-white shrink-0">
        {title}
      </h2>

      {/* Scrollable list only */}
      <div
        ref={listRef}
        className={[
          'flex-1 min-h-0 overflow-y-auto pr-1 rounded-xl transition-colors',
          'no-scrollbar',
          'touch-auto',
          'overscroll-y-contain',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-2 shrink-0">{footer}</div> : null}
    </section>
  );
}
