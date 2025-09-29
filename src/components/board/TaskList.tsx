'use client';

import React from 'react';
import TaskCard from './TaskCard';
import { Task, draggableIdFor, type DisplayDay } from './helpers';
import { DragState } from './hooks/useDragManager';

export default function TaskList({
  day,
  items,
  drag,
  targetDay,
  targetIndex,
  removeTask,
  onGrab,
  setCardRef,
}: {
  day: DisplayDay;
  items: Task[];
  drag: DragState | null;
  targetDay: DisplayDay | null;
  targetIndex: number | null;
  removeTask: (day: DisplayDay, id: string) => Promise<void>;
  onGrab: (p: {
    day: DisplayDay;
    index: number;
    taskId: string;
    taskText: string;
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
    rectGetter: () => DOMRect;
  }) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const placeholderAt =
    drag && targetDay === day && targetIndex != null ? targetIndex : null;

  const isSelfDrag = !!drag && drag.active && drag.fromDay === day;
  const sourceIndex = isSelfDrag ? drag!.fromIndex : null;

  if (process.env.NODE_ENV !== 'production') {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const t of items) seen.has(t.id) ? dups.push(t.id) : seen.add(t.id);
    if (dups.length)
      console.warn(`TaskList day=${day} duplicate task ids:`, dups);
  }

  const rows: React.ReactNode[] = [];

  const renderPlaceholder = (k: string) => (
    <div
      key={k}
      className="h-12 my-2 border-2 border-dashed rounded-2xl border-lime-400/70 bg-lime-50/40"
    />
  );

  // ---- Empty list: render a single placeholder (if targeting index 0) and return
  if (items.length === 0) {
    if (placeholderAt === 0) {
      rows.push(renderPlaceholder(`ph-empty-${day}`));
    }
    return <>{rows}</>;
  }

  // ---- Non-empty list
  // If inserting at the very start
  if (placeholderAt === 0) {
    rows.push(renderPlaceholder(`ph-top-${day}`));
  }

  let visibleIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const isDraggedHere = isSelfDrag && sourceIndex === i;

    if (!isDraggedHere) {
      const cardKey = `card-${day}-${i}-${t.id}`;
      const wrapKey = `wrap-${day}-${i}-${t.id}`;
      const afterKey = `ph-${day}-${visibleIndex + 1}`;

      rows.push(
        <div key={wrapKey} className="relative">
          <TaskCard
            key={cardKey}
            innerRef={(el) => setCardRef(draggableIdFor(day, t.id), el)}
            dragId={draggableIdFor(day, t.id)}
            task={t}
            onDelete={() => removeTask(day, t.id)}
            onGrab={(payload) => {
              const id = draggableIdFor(day, t.id);
              onGrab({
                day,
                index: i, // original array index
                taskId: t.id,
                taskText: t.text,
                clientX: payload.clientX,
                clientY: payload.clientY,
                pointerType: payload.pointerType,
                rectGetter: () => {
                  const el =
                    document.querySelector<HTMLElement>(
                      `[data-card-id="${id}"]`
                    ) ?? null;
                  return (
                    el?.getBoundingClientRect() ??
                    new DOMRect(payload.clientX - 1, payload.clientY - 1, 1, 1)
                  );
                },
              });
            }}
            hiddenWhileDragging={false}
            isRepeating={t.type === 'weekly'}
          />
        </div>
      );

      if (placeholderAt === visibleIndex + 1) {
        rows.push(renderPlaceholder(afterKey));
      }

      visibleIndex++;
    }
  }

  return <>{rows}</>;
}
