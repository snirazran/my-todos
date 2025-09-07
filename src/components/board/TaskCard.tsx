'use client';

import React, { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from './helpers';

export default function TaskCard({
  dragId,
  index,
  task,
  onDelete,
  onGrab,
  innerRef,
  hiddenWhileDragging = false,
}: {
  dragId: string;
  index: number;
  task: Task;
  onDelete: () => void;
  onGrab: (args: { clientX: number; clientY: number }) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  hiddenWhileDragging?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // bridge to parent
  const setRefs = (el: HTMLDivElement | null) => {
    ref.current = el;
    innerRef?.(el);
  };

  const startGrab = (ev: React.MouseEvent | React.TouchEvent) => {
    // ignore delete button drags
    const target = ev.target as HTMLElement;
    if (target.closest('[data-role="delete"]')) return;

    const isTouch =
      'touches' in ev && (ev as React.TouchEvent).touches.length > 0;
    const clientX = isTouch
      ? (ev as React.TouchEvent).touches[0].clientX
      : (ev as React.MouseEvent).clientX;
    const clientY = isTouch
      ? (ev as React.TouchEvent).touches[0].clientY
      : (ev as React.MouseEvent).clientY;

    ev.preventDefault();
    ev.stopPropagation();

    onGrab({ clientX, clientY });
  };

  if (hiddenWhileDragging) {
    return <div className="h-0 p-0 m-0" aria-hidden />;
  }

  return (
    <div
      ref={setRefs}
      data-card-id={dragId}
      onMouseDown={startGrab}
      onTouchStart={startGrab}
      className={[
        'flex items-center gap-3 p-3 mb-2 select-none rounded-xl transition-[box-shadow,background-color] duration-150',
        'bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600',
        'border border-slate-200 dark:border-slate-600',
        'shadow-sm hover:shadow',
        'cursor-grab active:cursor-grabbing',
      ].join(' ')}
      style={{
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'none',
      }}
    >
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.text}
      </span>
      <button
        data-role="delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="מחק"
        className="shrink-0"
      >
        <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
      </button>
    </div>
  );
}
