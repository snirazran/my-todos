'use client';

import React from 'react';

export default function DayColumn({
  title,
  listRef,
  children,
  footer, // ⬅️ NEW
  maxHeightClass = 'max-h-[calc(100vh-170px)]',
}: {
  title: string;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  /** content rendered **outside** the scrollable list, fixed at column bottom */
  footer?: React.ReactNode; // ⬅️ NEW
  /** allow board to set a device-height aware limit */
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
        'p-3 md:p-4',
        'min-h-[100px] md:min-h-[100px]',
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
        ].join(' ')}
      >
        {children}
      </div>

      {/* Fixed footer (always visible) */}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
