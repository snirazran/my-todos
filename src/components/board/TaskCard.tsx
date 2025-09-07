'use client';

import React from 'react';
import { Draggable, DraggableProvidedDraggableProps } from '@hello-pangea/dnd';
import { Trash2 } from 'lucide-react';
import type { Task } from './helpers';
import { createPortal } from 'react-dom';

/**
 * Merge our visual transforms (tilt/scale) with the DnD inline transform.
 * The DnD lib sets style.transform inline; if we don't merge it, our rotate/scale
 * will be ignored. This guarantees the tilt while the user is holding the card.
 */
function mergeTransform(
  style: DraggableProvidedDraggableProps['style'],
  extra: string | null
): React.CSSProperties {
  const base = style ?? {};
  const existing = (base as any).transform as string | undefined;
  const transform = existing
    ? `${existing} ${extra ?? ''}`.trim()
    : (extra ?? '').trim();

  return {
    ...base,
    ...(transform ? { transform } : {}),
  };
}

/**
 * Portal wrapper: when dragging, render into document.body.
 * This matches Trello and prevents clipping / mis-hit-test during horizontal autoscroll.
 */
function InPortal({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  if (typeof document === 'undefined') return <>{children}</>;
  return active ? (
    createPortal(children as any, document.body)
  ) : (
    <>{children}</>
  );
}

export default function TaskCard({
  dragId,
  index,
  task,
  onDelete,
}: {
  dragId: string;
  index: number;
  task: Task;
  onDelete: () => void;
}) {
  return (
    <Draggable draggableId={dragId} index={index}>
      {(provided, snapshot) => {
        const isDragging = snapshot.isDragging;

        const className = [
          'flex items-center gap-3 p-3 mb-2 select-none rounded-xl transition-[box-shadow,background-color] duration-150',
          'bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600',
          'border border-slate-200 dark:border-slate-600 shadow-sm cursor-grab active:cursor-grabbing',
          isDragging ? 'shadow-2xl' : '',
        ].join(' ');

        // Merge transforms so the tilt is visible while holding
        const style = mergeTransform(
          provided.draggableProps.style,
          isDragging ? 'rotate(6deg) scale(1.04)' : null
        );

        const node = (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
            style={{
              ...style,
              touchAction: isDragging ? 'none' : 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
            className={className}
          >
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
              {task.text}
            </span>
            <button onClick={onDelete} title="מחק" className="shrink-0">
              <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
            </button>
          </div>
        );

        // Render in a portal while dragging (fixes misalignment while the board scrolls)
        return <InPortal active={isDragging}>{node}</InPortal>;
      }}
    </Draggable>
  );
}
