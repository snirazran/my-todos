'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { Task, draggableIdFor, type DisplayDay, type ApiDay, apiDayFromDisplay, labelForDisplayDay } from './helpers';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { EditHabitDaysDialog } from '@/components/ui/EditHabitDaysDialog';
import TagPopup from '@/components/ui/TagPopup';
import Fly from '@/components/ui/fly';
import { Plus, LayoutList, ListTodo, Repeat } from 'lucide-react';

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
  isAnyDragging,
  onAddRequested,
  onEditTask,
  onDoLater,
  filter = 'all',
  selectedTags = [],
  showCompleted = true,
  daysOrder,
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
    taskType?: 'weekly' | 'regular' | 'backlog' | 'habit';
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
    rectGetter: () => DOMRect;
    tags?: { id: string; name: string; color: string }[];
    calendarEventId?: string;
    startTime?: string;
    endTime?: string;
    frogodoroSession?: { date: string; completedCycles: number; timeSpent: number; shortBreaks?: number; shortBreakTime?: number; longBreaks?: number; longBreakTime?: number; } | null;
  }) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  onAddRequested: (text: string) => void;
  userTags?: { id: string; name: string; color: string }[];
  onToggleRepeat?: (taskId: string, day: DisplayDay) => void;
  isAnyDragging?: boolean;
  onEditTask?: (day: DisplayDay, taskId: string, newText: string) => Promise<void>;
  onDoLater?: (day: DisplayDay, taskId: string) => Promise<void>;
  filter?: 'all' | 'tasks' | 'habits';
  selectedTags?: string[];
  showCompleted?: boolean;
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;
}) {
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [dialog, setDialog] = useState<{ task: Task; day: DisplayDay; kind?: 'edit' | 'editDays' } | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  const placeholderAt =
    isDragging && targetDay === day && targetIndex != null ? targetIndex : null;

  const isSelfDrag = isDragging && dragFromDay === day;
  const sourceIndex = isSelfDrag && dragFromIndex != null ? dragFromIndex : null;

  const variantFor = (t: Task): 'regular' | 'weekly' | 'backlog' | 'habit' => {
    if (t.type === 'habit') return 'habit';
    if (t.type === 'weekly') return 'weekly';
    if (t.type === 'backlog') return 'backlog';
    return 'regular';
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateForDisplayDay = (displayDay: DisplayDay) => {
    const apiDay = apiDayFromDisplay(displayDay, daysOrder);
    if (apiDay === -1) return null;
    const base = new Date();
    const sunday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    sunday.setDate(base.getDate() - base.getDay());
    const target = new Date(sunday);
    target.setDate(sunday.getDate() + apiDay);
    return ymdLocal(target);
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' | 'habit' = dialog
    ? variantFor(dialog.task)
    : 'regular';

  const handleDeleteToday = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      if (dialogVariant === 'weekly' || dialogVariant === 'habit') {
        const date = dateForDisplayDay(dialog.day);
        if (date) {
          await fetch('/api/tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, taskId: dialog.task.id }),
          });
          window.dispatchEvent(new Event('board-refresh'));
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

  const filteredItems = items.filter(t => {
    if (filter === 'tasks' && t.type === 'habit') return false;
    if (filter === 'habits' && t.type !== 'habit') return false;
    if (!showCompleted && t.completed) return false;
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = t.tags?.some(tagId => selectedTags.includes(tagId));
      if (!hasTag) return false;
    }
    return true;
  });

  // ---- Empty list: render a single placeholder (if targeting index 0) OR themed empty state
  if (filteredItems.length === 0) {
    if (placeholderAt === 0) {
      rows.push(renderPlaceholder(`ph-empty-${day}`));
    } else {
      // THEMED EMPTY STATE / ADD BUTTON
      rows.push(
        <button
          key={`empty-state-${day}`}
          onClick={() => onAddRequested('')}
          className="w-full flex flex-col items-center justify-center py-4 text-center border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-center w-10 h-10 mb-2 transition-all border rounded-full bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
            <Fly size={20} y={-2} />
          </div>
          <p className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
            Add a task
          </p>
        </button>
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

    // Filter Logic
    if (filter === 'tasks' && t.type === 'habit') continue;
    if (filter === 'habits' && t.type !== 'habit') continue;
    if (!showCompleted && t.completed) continue;
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = t.tags?.some(tagId => selectedTags.includes(tagId));
      if (!hasTag) continue;
    }

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
              // Resolve tags
              const resolvedTags = t.tags?.map(tagId => {
                const found = userTags?.find(ut => ut.id === tagId || ut.name === tagId);
                return found || { id: tagId, name: tagId, color: '' };
              });

              onGrab({
                day,
                index: i, // original array index
                taskId: t.id,
                taskText: t.text,
                taskType: t.type,
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
                tags: resolvedTags,
                calendarEventId: t.calendarEventId,
                startTime: t.startTime,
                endTime: t.endTime,
                frogodoroSession: t.frogodoroSession,
              });
            }}
            hiddenWhileDragging={false}
            isRepeating={t.type === 'weekly'}
            userTags={userTags}
            isAnyDragging={isAnyDragging}
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
        isHabit={menu ? items.find((t) => t.id === menu.id)?.type === 'habit' : false}
        onToggleRepeat={onToggleRepeat ? () => { if (menu) { onToggleRepeat(menu.id, day); setMenu(null); } } : undefined}
        isWeekly={menu ? items.find((t) => t.id === menu.id)?.type === 'weekly' : false}
        onDelete={() => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t) setDialog({ task: t, day });
          }
          setMenu(null);
        }}
        onEdit={(taskId) => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t && onEditTask) {
              setDialog({ task: t, day, kind: 'edit' });
            }
          }
          setMenu(null);
        }}
        onDoLater={onDoLater ? () => {
          if (menu && onDoLater) {
            onDoLater(day, menu.id);
            setMenu(null);
          }
        } : undefined}
        onChangeDays={() => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t) setDialog({ task: t, day, kind: 'editDays' });
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

      {dialog && dialog.kind === 'edit' && onEditTask && (
        <EditTaskDialog
          open={!!dialog}
          initialText={dialog.task.text}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async (newText) => {
            setBusy(true);
            await onEditTask(dialog.day, dialog.task.id, newText);
            setBusy(false);
            setDialog(null);
          }}
        />
      )}

      <DeleteDialog
        open={!!dialog && dialog.kind !== 'edit' && dialog.kind !== 'editDays'}
        variant={dialogVariant}
        itemLabel={dialog?.task.text}
        dayLabel={dialog && dialog.day < 7 ? labelForDisplayDay(dialog.day as Exclude<DisplayDay, 7>, daysOrder) : undefined}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialogVariant !== 'backlog' ? handleDeleteToday : handleDeleteAll
        }
        onDeleteAll={
          dialogVariant === 'weekly' || dialogVariant === 'habit'
            ? handleDeleteAll
            : dialogVariant === 'backlog'
              ? handleDeleteToday
              : undefined
        }
        onEditDays={
          dialogVariant === 'habit'
            ? () => setDialog((prev) => prev ? { ...prev, kind: 'editDays' } : prev)
            : undefined
        }
      />

      {dialog && dialog.kind === 'editDays' && (
        <EditHabitDaysDialog
          open
          taskId={dialog.task.id}
          taskLabel={dialog.task.text}
          initialGoal={dialog.task.timesPerWeek ?? 7}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async (newGoal) => {
            setBusy(true);
            try {
              await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: dialog.task.id, timesPerWeek: newGoal }),
              });
              window.dispatchEvent(new Event('board-refresh'));
            } finally {
              setBusy(false);
              setDialog(null);
              setMenu(null);
            }
          }}
        />
      )}
    </>
  );
});
