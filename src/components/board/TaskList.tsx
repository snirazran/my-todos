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
  // Raw target index from the hook (computed against DOM WITHOUT the dragged card).
  const rawPlaceholderAt =
    drag && targetDay === day && targetIndex != null ? targetIndex : null;

  const isSelfDrag = !!drag && drag.active && drag.fromDay === day;
  const sourceIndex = isSelfDrag ? drag!.fromIndex : null;

  // IMPORTANT: Do NOT shift by -1 here. The hook's targetIndex already
  // corresponds to the visible (dragged-free) list.
  const placeholderAt: number | null = rawPlaceholderAt;

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

  // We iterate original items but keep a "visible index" that only counts rendered cards
  let visibleIndex = 0;

  // If inserting at the very start
  if (placeholderAt === 0) {
    rows.push(renderPlaceholder(`ph-top-${day}`));
  }

  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const isDraggedHere = isSelfDrag && sourceIndex === i;

    // Skip rendering the dragged card in its source list to avoid the ghost gap.
    if (!isDraggedHere) {
      const cardKey = `card-${day}-${i}-${t.id}`;
      const afterKey = `ph-${day}-${visibleIndex + 1}`;

      rows.push(
        <div key={`wrap-${day}-${i}-${t.id}`} className="relative">
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
                index: i, // pass original index to the hook
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

      // Insert placeholder after this visible card when it matches
      if (placeholderAt === visibleIndex + 1) {
        rows.push(renderPlaceholder(afterKey));
      }

      visibleIndex++;
    }
  }

  // Special case: inserting into an empty list
  if (items.length === 0 && placeholderAt === 0) {
    rows.push(renderPlaceholder(`ph-end-${day}`));
  }

  return <>{rows}</>;
}
