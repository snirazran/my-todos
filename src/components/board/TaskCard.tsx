'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from './helpers';

export default function TaskCard({
  dragId,
  index,
  task,
  onDelete,
  onGrab,
  innerRef,
  hiddenWhileDragging,
}: {
  dragId: string;
  index: number;
  task: Task;
  onDelete: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  onGrab: (e: {
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
  }) => void;
  hiddenWhileDragging?: boolean;
}) {
  return (
    <div
      ref={innerRef}
      data-card-id={dragId}
      // ⬇️ stop native browser drag ghosting
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      // ✅ THE FIX IS HERE 👇
      style={{ touchAction: 'pan-y' }}
      className={[
        'flex items-center gap-3 p-3 select-none rounded-xl transition-[box-shadow,background-color]',
        'bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600',
        'border border-slate-200 dark:border-slate-600 shadow-sm',
        'cursor-grab active:cursor-grabbing', // nicer feedback
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      onPointerDown={(e) => {
        // ignore right/middle click
        // @ts-ignore
        if (e.button && e.button !== 0) return;
        // don't start drag from interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, [role="button"]'))
          return;

        onGrab({
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType: (e.pointerType as any) === 'touch' ? 'touch' : 'mouse',
        });
      }}
      role="listitem"
      aria-grabbed={false}
    >
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.text}
      </span>

      <button onClick={onDelete} title="מחק" className="shrink-0" type="button">
        <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
      </button>
    </div>
  );
}
