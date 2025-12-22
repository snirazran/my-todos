'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { Task, draggableIdFor, type DisplayDay, apiDayFromDisplay } from './helpers';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TagPopup from '@/components/ui/TagPopup';
import Fly from '@/components/ui/fly';

export default React.memo(function TaskList({
  day,
  items,
  isDragging,
  dragFromDay,
  dragFromIndex,
  targetDay,
  targetIndex,
  removeTask,
  onGrab,
  setCardRef,
  userTags,
  onToggleRepeat,
}: {
  day: DisplayDay;
  items: Task[];
  isDragging: boolean;
  dragFromDay?: number;
  dragFromIndex?: number;
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
  userTags?: { id: string; name: string; color: string }[];
  onToggleRepeat?: (taskId: string, day: DisplayDay) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [dialog, setDialog] = useState<{ task: Task; day: DisplayDay } | null>(null);
  const [busy, setBusy] = useState(false);
  
  const [tagPopup, setTagPopup] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  const placeholderAt =
    isDragging && targetDay === day && targetIndex != null ? targetIndex : null;

  const isSelfDrag = isDragging && dragFromDay === day;
  const sourceIndex = isSelfDrag && dragFromIndex != null ? dragFromIndex : null;

  const variantFor = (t: Task): 'regular' | 'weekly' | 'backlog' => {
    if (t.type === 'weekly') return 'weekly';
    if (t.type === 'backlog') return 'backlog';
    return 'regular';
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateForDisplayDay = (displayDay: DisplayDay) => {
    const apiDay = apiDayFromDisplay(displayDay);
    if (apiDay === -1) return null;
    const base = new Date();
    const sunday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    sunday.setDate(base.getDate() - base.getDay());
    const target = new Date(sunday);
    target.setDate(sunday.getDate() + apiDay);
    return ymdLocal(target);
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' = dialog
    ? variantFor(dialog.task)
    : 'regular';

  const handleDeleteToday = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      if (dialogVariant === 'weekly') {
        const date = dateForDisplayDay(dialog.day);
        if (date) {
          await fetch('/api/tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, taskId: dialog.task.id }),
          });
        }
      } else {
        await removeTask(dialog.day, dialog.task.id);
      }
    } finally {
      setBusy(false);
      setDialog(null);
      setMenu(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      await removeTask(dialog.day, dialog.task.id);
    } finally {
      setBusy(false);
      setDialog(null);
      setMenu(null);
    }
  };
  
  const handleTagSave = async (taskId: string, newTags: string[]) => {
      try {
          await fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId, tags: newTags }),
          });
          
          window.dispatchEvent(new Event('tags-updated'));
      } catch (e) {
          console.error("Failed to update tags", e);
      }
  };

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
      className="h-12 my-2 border-2 border-dashed rounded-xl border-primary/50 bg-primary/10"
    />
  );

  // ---- Empty list: render a single placeholder (if targeting index 0) OR themed empty state
  if (items.length === 0) {
    if (placeholderAt === 0) {
      rows.push(renderPlaceholder(`ph-empty-${day}`));
    } else {
      // THEMED EMPTY STATE
      rows.push(
        <div 
          key={`empty-state-${day}`}
          className="flex flex-col items-center justify-center py-2.5 px-4 text-center border-2 border-dashed border-border bg-muted/30 rounded-2xl transition-colors group-hover:bg-muted/50"
        >
          <div className="mb-1 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">
            <Fly size={28} />
          </div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            No tasks
          </p>
        </div>
      );
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
      const cardKey = `card-${day}-${t.id}`;
      const wrapKey = `wrap-${day}-${t.id}`;
      const afterKey = `ph-${day}-${visibleIndex + 1}`;

      rows.push(
        <div key={wrapKey} className="relative">
          <TaskCard
            key={cardKey}
            innerRef={(el) => setCardRef(draggableIdFor(day, t.id), el)}
            dragId={draggableIdFor(day, t.id)}
            task={t}
            menuOpen={menu?.id === t.id}
            onToggleMenu={(rect) => {
              setMenu((prev) => {
                if (prev?.id === t.id) return null;
                const MENU_W = 160; // Updated width to match TaskMenu min-w
                const MENU_H = 60;
                const GAP = 8;
                const MARGIN = 10;
                const vw = typeof window !== 'undefined' ? window.innerWidth : 480;
                const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
                let left = rect.left + rect.width / 2 - MENU_W / 2;
                left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
                let top = rect.bottom + GAP;
                if (top + MENU_H > vh - MARGIN) {
                  top = rect.top - MENU_H - GAP;
                }
                top = Math.max(MARGIN, Math.min(top, vh - MENU_H - MARGIN));
                return { id: t.id, top, left };
              });
            }}
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
            userTags={userTags}
          />
        </div>
      );

      if (placeholderAt === visibleIndex + 1) {
        rows.push(renderPlaceholder(afterKey));
      }

      visibleIndex++;
    }
  }

  return (
    <>
      {rows}
      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="second"
        onToggleRepeat={onToggleRepeat ? () => { if(menu) { onToggleRepeat(menu.id, day); setMenu(null); } } : undefined}
        isWeekly={menu ? items.find((t) => t.id === menu.id)?.type === 'weekly' : false}
        onDelete={() => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t) setDialog({ task: t, day });
          }
          setMenu(null);
        }}
      />
      <TagPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={items.find(t => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />
      <DeleteDialog
        open={!!dialog}
        variant={dialogVariant}
        itemLabel={dialog?.task.text}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialogVariant !== 'backlog' ? handleDeleteToday : handleDeleteAll
        }
        onDeleteAll={
          dialogVariant === 'weekly'
            ? handleDeleteAll
            : dialogVariant === 'backlog'
            ? handleDeleteToday
            : undefined
        }
      />
    </>
  );
});
