'use client';

import React from 'react';

export default function DayColumn({
  title,
  listRef,
  listExtraClass = '',
  children,
}: {
  title: string;
  listRef?: (el: HTMLDivElement | null) => void;
  listExtraClass?: string;
  children: React.ReactNode; // <-- plain nodes, not a render-prop
}) {
  return (
    <section
      dir="rtl"
      className="
        flex flex-col
        bg-white/90 dark:bg-slate-800/90
        rounded-2xl shadow
        max-h-[calc(100vh-170px)]
        min-h-0
        p-3 md:p-4
        border border-slate-200/70 dark:border-slate-700/60
      "
    >
      <h2 className="mb-3 font-semibold text-center md:mb-4 text-slate-900 dark:text-white">
        {title}
      </h2>

      <div
        ref={listRef}
        className={[
          'flex-1 overflow-y-auto pr-1 rounded-xl transition-colors',
          'no-scrollbar',
          listExtraClass,
        ].join(' ')}
      >
        {children}
      </div>
    </section>
  );
}
