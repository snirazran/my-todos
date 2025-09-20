'use client';

import React from 'react';
import GapRail from './GapRail';
import InlineComposer from './InlineComposer';
import TaskCard from './TaskCard';
import { Task, draggableIdFor } from './helpers';
import { DragState } from './hooks/useDragManager';

export default function TaskList({
  day,
  items,
  drag,
  targetDay,
  targetIndex,
  composer,
  draft,
  setDraft,
  openBetweenComposer,
  openBottomComposer,
  cancelComposer,
  confirmComposer,
  removeTask,
  onGrab,
  setCardRef,
}: {
  day: number;
  items: Task[];
  drag: DragState | null;
  targetDay: number | null;
  targetIndex: number | null;
  composer: { day: number; afterIndex: number | null } | null;
  draft: string;
  setDraft: (s: string) => void;
  openBetweenComposer: (day: number, afterIndex: number) => void;
  openBottomComposer: (day: number) => void;
  cancelComposer: () => void;
  confirmComposer: (day: number) => void;
  removeTask: (day: number, id: string) => Promise<void>;
  onGrab: (p: {
    day: number;
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

  if (process.env.NODE_ENV !== 'production') {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const t of items) {
      if (seen.has(t.id)) dups.push(t.id);
      else seen.add(t.id);
    }
    if (dups.length)
      console.warn(`TaskList day=${day} duplicate task ids:`, dups);
  }

  const rows: React.ReactNode[] = [];

  // TOP rail
  if (items.length > 0) {
    const topOpen =
      !!composer && composer.day === day && composer.afterIndex === -1;
    rows.push(
      <GapRail
        key={`rail-top-${day}`}
        overlayHidden={topOpen}
        onAdd={() => openBetweenComposer(day, -1)}
        disabled={!!drag?.active}
      />
    );
    if (topOpen) {
      rows.push(
        <InlineComposer
          key={`composer-top-${day}`}
          value={draft}
          onChange={setDraft}
          onConfirm={() => confirmComposer(day)}
          onCancel={cancelComposer}
          autoFocus
          scrollIntoViewOnMount
        />
      );
    }
  }

  if (items.length > 0 && placeholderAt === 0) {
    rows.push(
      <div
        key={`ph-top-${day}`}
        className="h-12 my-2 border-2 border-dashed rounded-2xl border-lime-400/70 bg-lime-50/40"
      />
    );
  }

  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const isDragged =
      drag && drag.active && drag.fromDay === day && drag.fromIndex === i;

    const children: React.ReactNode[] = [];

    children.push(
      <TaskCard
        key={`card-${day}-${i}-${t.id}`}
        innerRef={(el) => setCardRef(draggableIdFor(day, t.id), el)}
        dragId={draggableIdFor(day, t.id)}
        task={t}
        onDelete={() => removeTask(day, t.id)}
        onGrab={(payload) => {
          const id = draggableIdFor(day, t.id);
          onGrab({
            day,
            index: i,
            taskId: t.id,
            taskText: t.text,
            clientX: payload.clientX,
            clientY: payload.clientY,
            pointerType: payload.pointerType,
            rectGetter: () => {
              const el =
                document.querySelector<HTMLElement>(`[data-card-id="${id}"]`) ??
                null;
              return (
                el?.getBoundingClientRect() ??
                new DOMRect(payload.clientX - 1, payload.clientY - 1, 1, 1)
              );
            },
          });
        }}
        hiddenWhileDragging={!!isDragged}
      />
    );

    if (placeholderAt === i + 1) {
      children.push(
        <div
          key={`ph-${day}-${i + 1}`}
          className="h-12 my-2 border-2 border-dashed rounded-2xl border-lime-400/70 bg-lime-50/40"
        />
      );
    }

    if (i < items.length - 1) {
      const gapOpen =
        !!composer && composer.day === day && composer.afterIndex === i;
      children.push(
        <GapRail
          key={`rail-${day}-${i}`}
          overlayHidden={gapOpen}
          onAdd={() => openBetweenComposer(day, i)}
          disabled={!!drag?.active}
        />
      );

      if (gapOpen) {
        children.push(
          <InlineComposer
            key={`composer-gap-${day}-${i}`}
            value={draft}
            onChange={setDraft}
            onConfirm={() => confirmComposer(day)}
            onCancel={cancelComposer}
            autoFocus
            scrollIntoViewOnMount
          />
        );
      }
    }

    rows.push(
      <div key={`wrap-${day}-${i}-${t.id}`} className="relative">
        {children}
      </div>
    );
  }

  if (items.length === 0 && placeholderAt === 0) {
    rows.push(
      <div
        key={`ph-end-${day}`}
        className="h-12 my-2 border-2 border-dashed rounded-2xl border-lime-400/70 bg-lime-50/40"
      />
    );
  }

  if (composer && composer.day === day && composer.afterIndex === null) {
    rows.push(
      <div key={`composer-bottom-wrap-${day}`} className="mt-3 ">
        <InlineComposer
          value={draft}
          onChange={setDraft}
          onConfirm={() => confirmComposer(day)}
          onCancel={cancelComposer}
          autoFocus
          scrollIntoViewOnMount
        />
      </div>
    );
  }

  return <>{rows}</>;
}
