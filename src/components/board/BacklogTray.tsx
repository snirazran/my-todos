import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, CornerDownLeft, Plus } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Task, draggableIdFor } from './helpers';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import {
  FilterChipStrip,
  FilteredEmptyState,
  FilterStatusLine,
  FilterTriggerButton,
} from '@/components/ui/TaskFilterBar';
import { matchesTaskFilters, sortTasks, type TaskFilters } from '@/lib/taskFilters';
import { SideOpenTray } from '@/components/ui/SideOpenTray';
import { TimePopup } from '@/components/ui/TimePopup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onGrab: (params: {
    day: number;
    index: number;
    taskId: string;
    taskText: string;
    taskType?: 'weekly' | 'regular' | 'backlog';
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
    rectGetter: () => DOMRect;
    tags?: { id: string; name: string; color: string }[];
    calendarEventId?: string;
    startTime?: string;
    endTime?: string;
    reminder?: string;
    notes?: string;
    checklist?: { id: string; text: string; done: boolean }[];
    frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
  }) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  activeDragId: string | null;
  trayRef?: React.RefObject<HTMLDivElement | null>;
  closeProgress?: number; // 0 = fully open, 1 = fully closed
  onRemove?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onToggleRepeat?: (id: string) => void;
  onDoToday?: (id: string) => void;
  onScheduleTask?: (taskId: string, data: { startTime: string; endTime: string; reminder: string }) => Promise<void> | void;
  userTags?: { id: string; name: string; color: string }[];
  /** The board-wide filter — the tray narrows with the columns. */
  filters: TaskFilters;
  baseFilters?: TaskFilters;
  onChangeFilters?: (filters: TaskFilters) => void;
  filtersActive?: boolean;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  onClearFilters?: () => void;
  hideDoTodayButton?: boolean;
  backlogDayIndex?: number;
  onQuickSave?: (text: string) => Promise<void> | void;
}

type AgeBucket = 'fresh' | 'month' | 'old';
const DAY_MS = 86_400_000;
const BUCKET_LABEL: Record<AgeBucket, string> = {
  fresh: 'This week',
  month: 'Earlier this month',
  old: 'Waiting a while',
};

function ageBucket(savedAt: string | undefined, now: number): AgeBucket {
  const t = savedAt ? Date.parse(savedAt) : NaN;
  if (!Number.isFinite(t)) return 'fresh';
  const days = (now - t) / DAY_MS;
  if (days < 7) return 'fresh';
  if (days < 30) return 'month';
  return 'old';
}

function QuickSave({ onSave }: { onSave: (text: string) => Promise<void> | void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    void onSave(value);
    inputRef.current?.focus();
  };
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/60 py-1.5 pl-3 pr-1.5 shadow-sm focus-within:border-primary/50 focus-within:bg-card"
    >
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.75} />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Save an idea for later"
        aria-label="New saved task"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-base font-semibold outline-none placeholder:text-muted-foreground/70"
      />
      <AnimatePresence initial={false}>
        {text.trim() && (
          <motion.button
            type="submit"
            aria-label="Save"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground active:scale-90"
          >
            <CornerDownLeft className="h-4 w-4" strokeWidth={2.75} />
          </motion.button>
        )}
      </AnimatePresence>
    </form>
  );
}

export default React.memo(function BacklogTray({
  isOpen,
  onClose,
  tasks,
  onGrab,
  setCardRef,
  activeDragId,
  trayRef,
  closeProgress = 0,
  onRemove,
  onEdit,
  onDoToday,
  onScheduleTask,
  userTags = [],
  filters,
  baseFilters,
  onChangeFilters,
  filtersActive = false,
  activeFilterCount = 0,
  onOpenFilters,
  onClearFilters,
  hideDoTodayButton = false,
  backlogDayIndex = 7,
  onQuickSave,
}: Props) {
  // Menu & Dialog State
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [editItem, setEditItem] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  const [scheduleDialog, setScheduleDialog] = useState<{ task: Task } | null>(null);

  const [stripOpen, setStripOpen] = useState(false);
  const canFilterInline = !!onChangeFilters && !!baseFilters;

  const handleDelete = async () => {
    if (!confirmItem || !onRemove) return;
    setBusy(true);
    try {
      await onRemove(confirmItem.id);
    } finally {
      setBusy(false);
      setConfirmItem(null);
    }
  };

  const handleTagSave = async (taskId: string, newTags: string[]) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: taskId,
          tags: newTags,
        }),
      });
      window.dispatchEvent(new Event('tags-updated'));
    } catch (e) {
      console.error('Failed to update tags', e);
    }
  };

  // Auto-hide when dragging FROM the tray
  const isDraggingAny = !!activeDragId;

  const filteredTasks = sortTasks(
    tasks.filter((t) => matchesTaskFilters(t, filters)),
    filters.sort,
    userTags.map((t) => t.id),
  );
  const groups = useMemo(() => {
    const now = Date.now();
    const order: AgeBucket[] = ['fresh', 'month', 'old'];
    const byBucket = new Map<AgeBucket, Task[]>();
    for (const t of filteredTasks) {
      const bucket = ageBucket(t.savedAt, now);
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), t]);
    }
    return order
      .filter((bucket) => (byBucket.get(bucket)?.length ?? 0) > 0)
      .map((bucket) => ({ bucket, tasks: byBucket.get(bucket)! }));
  }, [filteredTasks]);
  const showGroupHeaders = groups.length > 1 || groups[0]?.bucket === 'old';

  return (
    <>
      <SideOpenTray
        ref={trayRef}
        isOpen={isOpen}
        onClose={onClose}
        title="Saved"
        subtitle={
          filteredTasks.length === 0
            ? 'Tasks without a day'
            : `${filteredTasks.length} ${filteredTasks.length === 1 ? 'task' : 'tasks'} waiting for a day`
        }
        icon={<Icon name="saved" className="h-6 w-6" />}
        iconContainerClassName="bg-primary/10 text-primary"
        className="top-[38vh] md:top-0 md:w-[500px]"
        backdropZ={1305}
        isDraggingAny={isDraggingAny}
        closeProgress={closeProgress}
        rightActions={
          canFilterInline ? (
            <FilterTriggerButton
              compact
              onClick={() => setStripOpen((v) => !v)}
              activeCount={activeFilterCount}
              open={stripOpen}
            />
          ) : (
            <FilterTriggerButton
              compact
              onClick={() => onOpenFilters?.()}
              activeCount={activeFilterCount}
            />
          )
        }
      >
        {canFilterInline && (stripOpen || filtersActive) && (
          <div
            style={{ ['--strip-fade' as string]: 'var(--card)' }}
            className="sticky top-0 z-20 -mx-1 flex flex-col gap-1.5 bg-card px-1 pb-2 pt-1"
          >
            <FilterChipStrip
              filters={filters}
              base={baseFilters!}
              tags={userTags}
              tasks={tasks}
              onChange={onChangeFilters!}
              onClearAll={() => onClearFilters?.()}
              onOpenMore={() => onOpenFilters?.()}
            />
            {filtersActive && (
              <FilterStatusLine
                tasks={tasks}
                filters={filters}
                onClearAll={() => onClearFilters?.()}
                className="self-start"
              />
            )}
          </div>
        )}
        {onQuickSave && (
          <div className="shrink-0 pb-3 pt-1">
            <QuickSave onSave={onQuickSave} />
          </div>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredTasks.length === 0 && filtersActive && tasks.length > 0 ? (
            <div className="px-1 py-6">
              <FilteredEmptyState
                hidden={tasks.length}
                onClearAll={() => onClearFilters?.()}
              />
            </div>
          ) : filteredTasks.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10">
                <Icon name="saved" className="h-10 w-10" />
              </span>
              <p className="text-base font-black text-foreground">
                Nothing saved yet
              </p>
              <p className="max-w-[26ch] text-sm font-semibold leading-snug text-muted-foreground">
                Park anything that doesn&apos;t need a day yet. Type it above, or drag a task to Save for later.
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Drag any task here
              </span>
            </motion.div>
          ) : (
            groups.flatMap(({ bucket, tasks: groupTasks }) => [
              showGroupHeaders ? (
                <motion.div
                  key={`group-${bucket}`}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-1 pb-1 pt-3 first:pt-0"
                >
                  <p className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                    {BUCKET_LABEL[bucket]}
                    <span className="ml-1.5 font-bold opacity-70">{groupTasks.length}</span>
                  </p>
                  {bucket === 'old' && (
                    <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground/80">
                      Still want these? Give one a day, or let it go.
                    </p>
                  )}
                </motion.div>
              ) : null,
              ...groupTasks.map((t) => {
              const originalIndex = tasks.findIndex((it) => it.id === t.id);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    transition: { duration: 0.15 },
                  }}
                  key={t.id}
                  layout="position"
                  className="w-full relative"
                  data-hint="saved-task-card"
                >
                  <div className="group relative">
                    <TaskCard
                      innerRef={(el) =>
                        setCardRef(draggableIdFor(backlogDayIndex as any, t.id), el)
                      }
                      dragId={draggableIdFor(backlogDayIndex as any, t.id)}
                      task={t}
                      userTags={userTags}
                      menuOpen={menu?.id === t.id}
                      onToggleMenu={(rect) => {
                        setMenu((prev) => {
                          if (prev?.id === t.id) return null;
                          const MENU_W = 160;
                          const MENU_H = 180; // Approximate height with all options
                          const MARGIN = 10;
                          const vw = window.innerWidth;
                          const vh = window.innerHeight;

                          let left =
                            rect.left + rect.width / 2 - MENU_W / 2;

                          // Clamp horizontal position
                          left = Math.max(
                            MARGIN,
                            Math.min(left, vw - MENU_W - MARGIN),
                          );

                          let top = rect.bottom + 8;
                          // If menu would go off bottom, flip to above
                          if (top + MENU_H > vh - MARGIN) {
                            top = rect.top - MENU_H - 8;
                          }

                          return { id: t.id, top, left };
                        });
                      }}
                      hiddenWhileDragging={activeDragId === t.id}
                      isRepeating={t.type === 'weekly'}
                      touchAction="auto" // Vertical scroll, so auto is fine? Or none? TaskCard usually handles handle
                      isAnyDragging={!!activeDragId}
                      onGrab={(payload) => {
                        // Same grab logic
                        const resolvedTags = t.tags?.map((tagId) => {
                          const found = userTags?.find(
                            (ut) => ut.id === tagId || ut.name === tagId,
                          );
                          return (
                            found || { id: tagId, name: tagId, color: '' }
                          );
                        });
                        onGrab({
                          day: backlogDayIndex,
                          index: originalIndex,
                          taskId: t.id,
                          taskText: t.text,
                          taskType: t.type,
                          clientX: payload.clientX,
                          clientY: payload.clientY,
                          pointerType: payload.pointerType,
                          rectGetter: () => {
                            const id = draggableIdFor(backlogDayIndex as any, t.id);
                            const el = document.querySelector(
                              `[data-card-id="${id}"]`,
                            );
                            return (
                              el?.getBoundingClientRect() ??
                              new DOMRect(0, 0, 0, 0)
                            );
                          },
                          tags: resolvedTags,
                          calendarEventId: t.calendarEventId,
                          startTime: t.startTime,
                          endTime: t.endTime,
                          reminder: t.reminder,
                          notes: t.notes,
                          checklist: t.checklist,
                          frogodoroSession: t.frogodoroSession,
                        });
                      }}
                      onDoToday={
                        onDoToday ? () => onDoToday(t.id) : undefined
                      }
                      hideDoTodayButton={hideDoTodayButton}
                      compact
                    />
                  </div>
                </motion.div>
              );
            }),
            ])
          )}
        </AnimatePresence>
      </SideOpenTray>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="first"
        isWeekly={
          menu
            ? tasks.find((t) => t.id === menu.id)?.type === 'weekly'
            : false
        }
        onEdit={(id) => {
          const t = tasks.find((it) => it.id === id);
          if (t && onEdit) {
            setEditItem(t);
          }
          setMenu(null);
        }}
        onDoToday={() => {
          if (menu && onDoToday) onDoToday(menu.id);
          setMenu(null);
        }}
        onDelete={() => {
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) setConfirmItem(t);
          }
          setMenu(null);
        }}
        onSchedule={onScheduleTask ? () => {
          if (menu) {
            const t = tasks.find(it => it.id === menu.id);
            if (t) setScheduleDialog({ task: t });
          }
          setMenu(null);
        } : undefined}
      />

      {onScheduleTask && (
        <TimePopup
          open={!!scheduleDialog}
          taskName={scheduleDialog?.task.text ?? ''}
          initialStartTime={scheduleDialog?.task.startTime || ''}
          initialReminder={scheduleDialog?.task.reminder || ''}
          onClose={() => setScheduleDialog(null)}
          onSave={async (data) => {
            if (!scheduleDialog) return;
            await onScheduleTask(scheduleDialog.task.id, data);
            setScheduleDialog(null);
          }}
        />
      )}

      <TagsPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={tasks.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />

      <EditTaskDialog
          open={!!editItem}
          initialText={editItem?.text ?? ''}
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={async (newText) => {
            if (!editItem || !onEdit) return;
            setBusy(true);
            await onEdit(editItem.id, newText);
            setBusy(false);
            setEditItem(null);
          }}
        />

      <DeleteDialog
        open={!!confirmItem}
        variant="backlog"
        itemLabel={confirmItem?.text}
        busy={busy}
        onClose={() => {
          if (!busy) setConfirmItem(null);
        }}
        onDeleteAll={handleDelete}
      />
    </>
  );
});
