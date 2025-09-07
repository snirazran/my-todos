'use client';

import React from 'react';
import {
  Droppable,
  DroppableProvided,
  DroppableStateSnapshot,
} from '@hello-pangea/dnd';

type DayColumnProps = {
  title: string;
  droppableId: string;
  children: (
    provided: DroppableProvided,
    snapshot: DroppableStateSnapshot
  ) => React.ReactNode;
};

export default function DayColumn({
  title,
  droppableId,
  children,
}: DayColumnProps) {
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

      <Droppable droppableId={droppableId} direction="vertical">
        {(provided, snapshot) => <>{children(provided, snapshot)}</>}
      </Droppable>
    </section>
  );
}
