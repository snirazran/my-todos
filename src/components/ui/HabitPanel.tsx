'use client';

import React, { useEffect, useState } from 'react';
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  animate,
} from 'framer-motion';
import {
  DndContext,
  closestCorners,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  Modifier,
} from '@dnd-kit/core';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Trash2,
  CheckCircle2,
  EllipsisVertical,
  CalendarCheck,
  Flame,
  Clock,
  Bell,
  Plus,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { Task } from '@/hooks/useTaskData';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { EditHabitDaysDialog } from '@/components/ui/EditHabitDaysDialog';
import TaskMenu from '@/components/board/TaskMenu';
import TagPopup from '@/components/ui/TagPopup';
import { ScheduleTaskDialog } from '@/components/ui/ScheduleTaskDialog';

type SavedTag = {
  id: string;
  name: string;
  color: string;
};

interface HabitPanelProps {
  habits: Task[];
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onSchedule?: (taskId: string, data: { startTime: string; endTime: string; reminder: string }) => void;
  tags: SavedTag[];
  flyRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  showCompleted: boolean;
  visuallyCompleted?: Set<string>;
  onAddRequested: (prefill: string, isHabit?: boolean) => void;
  onReorder?: (habits: Task[]) => void;
  date: string;
  paused?: boolean;
}

const DAYS_SHORT = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

export function HabitPanel({
  habits,
  onToggle,
  onEdit,
  onDelete,
  onSchedule,
  tags,
  flyRefs,
  showCompleted,
  visuallyCompleted,
  onAddRequested,
  onReorder,
  date,
  paused = false,
}: HabitPanelProps) {
  const [editingHabit, setEditingHabit] = React.useState<Task | null>(null);
  const [deletingHabit, setDeletingHabit] = React.useState<Task | null>(null);
  const [editingDaysHabit, setEditingDaysHabit] = React.useState<Task | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [menu, setMenu] = React.useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [tagPopupId, setTagPopupId] = React.useState<string | null>(null);
  const [scheduleDialog, setScheduleDialog] = React.useState<{ task: Task } | null>(null);

  const [isAnyDragging, setIsAnyDragging] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const activeAreaLimitsRef = React.useRef<{
    top: number;
    bottom: number;
  } | null>(null);

  React.useEffect(() => {
    if (isAnyDragging) {
      document.documentElement.classList.add('dragging');

      // Lock the scroll aggressively for the current gesture
      const handleTouchMove = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
      };

      window.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        document.documentElement.classList.remove('dragging');
        window.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [isAnyDragging]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = () => {
    setIsAnyDragging(true);
    // Calculate boundary
    const activeNodes = document.querySelectorAll('[data-habit-active="true"]');
    const container = scrollContainerRef.current;

    if (activeNodes.length > 0 && container) {
      const containerRect = container.getBoundingClientRect();
      const rects = Array.from(activeNodes).map((n) =>
        n.getBoundingClientRect(),
      );

      // Calculate limits relative to the container's *content* top
      const top = Math.min(
        ...rects.map((r) => r.top - containerRect.top + container.scrollTop),
      );
      const bottom = Math.max(
        ...rects.map((r) => r.bottom - containerRect.top + container.scrollTop),
      );

      activeAreaLimitsRef.current = { top, bottom };
    } else {
      activeAreaLimitsRef.current = null;
    }
  };
  const handleDragCancel = () => {
    setIsAnyDragging(false);
    activeAreaLimitsRef.current = null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsAnyDragging(false);
    activeAreaLimitsRef.current = null;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeHabits.findIndex((h) => h.id === active.id);
    const newIndex = activeHabits.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeHabits, oldIndex, newIndex);
    onReorder?.(reordered);
  };

  const restrictToActiveArea: Modifier = ({ transform, draggingNodeRect }) => {
    const limits = activeAreaLimitsRef.current;
    const container = scrollContainerRef.current;

    // Apply parent restriction first
    const parentRestricted = restrictToParentElement({
      transform,
      draggingNodeRect,
    } as any);
    const verticalRestricted = restrictToVerticalAxis({
      transform: parentRestricted,
      draggingNodeRect,
    } as any);

    if (limits !== null && draggingNodeRect && container) {
      const containerRect = container.getBoundingClientRect();
      const currentScrollTop = container.scrollTop;

      // Calculate absolute viewport boundaries for the active area based on current scroll
      const limitTop = containerRect.top - currentScrollTop + limits.top;
      const limitBottom = containerRect.top - currentScrollTop + limits.bottom;

      let newY = verticalRestricted.y;

      // Bottom restriction
      const currentBottom = draggingNodeRect.bottom + newY;
      if (currentBottom > limitBottom) {
        newY = limitBottom - draggingNodeRect.bottom;
      }

      // Top restriction
      const currentTop = draggingNodeRect.top + newY;
      if (currentTop < limitTop) {
        newY = limitTop - draggingNodeRect.top;
      }

      return {
        ...verticalRestricted,
        y: newY,
      };
    }
    return verticalRestricted;
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
      console.error('Failed to update tags', e);
    }
  };

  const [delayedCompleted, setDelayedCompleted] = useState<Set<string>>(
    new Set(),
  );

  const handleToggleWithDelay = React.useCallback(
    (id: string) => {
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;
      const isDone =
        habit.completed ||
        (habit.completedDates ?? []).includes(date) ||
        (visuallyCompleted ? visuallyCompleted.has(habit.id) : false);
      // If completing, keep it in active section for 3 seconds
      if (!isDone) {
        setDelayedCompleted((prev) => new Set(prev).add(id));
        setTimeout(() => {
          setDelayedCompleted((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 3000);
      }
      onToggle(id);
    },
    [habits, date, visuallyCompleted, onToggle],
  );

  const isHabitDone = React.useCallback(
    (h: Task) => {
      return (
        h.completed ||
        (h.completedDates ?? []).includes(date) ||
        (visuallyCompleted ? visuallyCompleted.has(h.id) : false)
      );
    },
    [date, visuallyCompleted],
  );

  const isHabitSettledDone = React.useCallback(
    (h: Task) => {
      if (delayedCompleted.has(h.id)) return false;
      return isHabitDone(h);
    },
    [delayedCompleted, isHabitDone],
  );

  const activeHabits = React.useMemo(() => {
    return habits.filter((h) => !isHabitSettledDone(h));
  }, [habits, isHabitSettledDone]);

  const completedHabits = React.useMemo(() => {
    return habits.filter((h) => isHabitSettledDone(h));
  }, [habits, isHabitSettledDone]);

  const visibleHabits = React.useMemo(() => {
    if (showCompleted) return habits;
    return activeHabits;
  }, [habits, showCompleted, activeHabits]);

  if (habits.length === 0) {
    return (
      <div className="px-4 pt-2 pb-4">
        <button
          onClick={() => onAddRequested('', true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 border border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted border border-muted-foreground/10">
            <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
            Add your first habit
          </p>
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-3">
      <div className="rounded-[22px] bg-card/40 border border-border/50 shadow-sm overflow-hidden p-1.5 pb-0 flex flex-col">
        {visibleHabits.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-2"
          >
            <button
              onClick={() => onAddRequested('', true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted border border-muted-foreground/10">
                <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                Add another habit
              </p>
            </button>
          </motion.div>
        ) : (
          <>
            {/* Active Habits */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToActiveArea]}
            >
              <div className="relative" ref={scrollContainerRef}>
                <SortableContext
                  items={activeHabits.map((h) => h.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <AnimatePresence initial={false}>
                    {activeHabits.map((habit) => (
                      <HabitItem
                        key={habit.id}
                        habit={habit}
                        isDone={isHabitDone(habit)}
                        onToggle={handleToggleWithDelay}
                        onDelete={() => setDeletingHabit(habit)}
                        onMenuOpen={(id, top, left) =>
                          setMenu({ id, top, left })
                        }
                        menuOpen={menu?.id === habit.id}
                        flyRefs={flyRefs}
                        tags={tags}
                        date={date}
                        isSortDragging={isAnyDragging}
                        paused={paused}
                      />
                    ))}
                  </AnimatePresence>
                </SortableContext>
              </div>
            </DndContext>

            {/* Completed Habits Section */}
            {showCompleted && completedHabits.length > 0 && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex items-center gap-3 px-3 py-0"
                >
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider select-none">
                    Completed
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </motion.div>

                <AnimatePresence initial={false} mode="popLayout">
                  {completedHabits.map((habit) => (
                    <HabitItem
                      key={habit.id}
                      habit={habit}
                      isDone={true}
                      onToggle={handleToggleWithDelay}
                      onDelete={() => setDeletingHabit(habit)}
                      onMenuOpen={(id, top, left) => setMenu({ id, top, left })}
                      menuOpen={menu?.id === habit.id}
                      flyRefs={flyRefs}
                      tags={tags}
                      date={date}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}
          </>
        )}
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isHabit
        onEdit={() => {
          const h = habits.find((h) => h.id === menu?.id) ?? null;
          if (h) setEditingHabit(h);
          setMenu(null);
        }}
        onAddTags={(id) => {
          setTagPopupId(id);
          setMenu(null);
        }}
        onSchedule={() => {
          const h = habits.find((h) => h.id === menu?.id) ?? null;
          if (h) setScheduleDialog({ task: h });
          setMenu(null);
        }}
        onChangeDays={() => {
          const h = habits.find((h) => h.id === menu?.id) ?? null;
          if (h) setEditingDaysHabit(h);
          setMenu(null);
        }}
        onDelete={() => {
          const h = habits.find((h) => h.id === menu?.id) ?? null;
          if (h) setDeletingHabit(h);
          setMenu(null);
        }}
      />

      {scheduleDialog && onSchedule && (
        <ScheduleTaskDialog
          open={!!scheduleDialog}
          taskName={scheduleDialog.task.text}
          initialStartTime={scheduleDialog.task.startTime || ''}
          initialEndTime={scheduleDialog.task.endTime || ''}
          initialReminder={scheduleDialog.task.reminder || ''}
          onClose={() => setScheduleDialog(null)}
          onSave={async (data) => {
            await onSchedule(scheduleDialog.task.id, data);
            setScheduleDialog(null);
          }}
        />
      )}

      <TagPopup
        open={!!tagPopupId}
        taskId={tagPopupId}
        initialTags={habits.find((h) => h.id === tagPopupId)?.tags}
        onClose={() => setTagPopupId(null)}
        onSave={handleTagSave}
      />

      <EditTaskDialog
        open={!!editingHabit}
        onClose={() => setEditingHabit(null)}
        initialText={editingHabit?.text || ''}
        title="Edit Habit"
        subtitle="Make changes to your habit below."
        onSave={(newText) => {
          if (editingHabit) onEdit(editingHabit.id, newText);
          setEditingHabit(null);
        }}
      />

      <DeleteDialog
        open={!!deletingHabit}
        onClose={() => setDeletingHabit(null)}
        variant="habit"
        itemLabel={deletingHabit?.text}
        dayLabel="today"
        busy={busy}
        onDeleteToday={async () => {
          if (!deletingHabit) return;
          setBusy(true);
          try {
            await fetch('/api/tasks', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date, taskId: deletingHabit.id }),
            });
            window.dispatchEvent(new Event('habits-updated'));
          } finally {
            setBusy(false);
            setDeletingHabit(null);
          }
        }}
        onDeleteAll={() => {
          if (deletingHabit) onDelete(deletingHabit.id);
          setDeletingHabit(null);
        }}
        onEditDays={() => {
          setEditingDaysHabit(deletingHabit);
          setDeletingHabit(null);
        }}
      />

      {editingDaysHabit && (
        <EditHabitDaysDialog
          open
          key={editingDaysHabit.id}
          taskId={editingDaysHabit.id}
          taskLabel={editingDaysHabit.text}
          initialGoal={editingDaysHabit.timesPerWeek ?? 7}
          busy={busy}
          onClose={() => setEditingDaysHabit(null)}
          onSave={async (newGoal) => {
            setBusy(true);
            try {
              await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: editingDaysHabit.id,
                  timesPerWeek: newGoal,
                }),
              });
              window.dispatchEvent(new Event('habits-updated'));
            } finally {
              setBusy(false);
              setEditingDaysHabit(null);
            }
          }}
        />
      )}
    </div>
  );
}

function HabitItem({
  habit,
  isDone,
  onToggle,
  onDelete,
  onMenuOpen,
  menuOpen,
  flyRefs,
  tags,
  date,
  isSortDragging,
  paused = false,
}: {
  habit: Task;
  isDone: boolean;
  onToggle: (id: string) => void;
  onDelete: () => void;
  onMenuOpen: (id: string, top: number, left: number) => void;
  menuOpen: boolean;
  flyRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  tags: SavedTag[];
  date: string;
  isSortDragging?: boolean;
  paused?: boolean;
}) {
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const isDraggingRef = React.useRef(false);
  const [swipeBlocked, setSwipeBlocked] = useState(false);
  const x = useMotionValue(0);
  const [isDesktop, setIsDesktop] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: habit.id, disabled: isOpen });

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close swipe when menu closes
  useEffect(() => {
    if (!menuOpen && isOpen) {
      setIsOpen(false);
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
    }
  }, [menuOpen]);

  // Reset swipe when sort drag starts
  useEffect(() => {
    if (isDragging || isSortDragging) {
      setSwipeBlocked(true);
      setIsOpen(false);
      setIsSwiping(false);
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
    } else if (swipeBlocked) {
      const timer = setTimeout(() => setSwipeBlocked(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isDragging, isSortDragging]);

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsSwiping(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsSwiping(false);
    }, 100);

    if (swipeBlocked) {
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
      return;
    }

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (isOpen) {
      if (offset > 15 || velocity > 100) {
        setIsOpen(false);
        animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
      } else {
        animate(x, -100, { type: 'spring', stiffness: 600, damping: 28 });
      }
    } else {
      if (offset < -60 || velocity < -200) {
        setIsOpen(true);
        animate(x, -100, { type: 'spring', stiffness: 600, damping: 28 });
      } else {
        animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalClick = (e: MouseEvent) => {
      // Don't close if clicking inside this habit's container (e.g. 3-dots button)
      if (
        containerRef.current &&
        containerRef.current.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
    };
    const handleScroll = () => {
      setIsOpen(false);
      animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
    };
    window.addEventListener('click', handleGlobalClick, { capture: true });
    window.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('click', handleGlobalClick, { capture: true });
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, x]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    onToggle(habit.id);
  };

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        (
          containerRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = node;
        setSortableRef(node);
      }}
      {...attributes}
      {...listeners}
      layout={!isSortDragging}
      initial={{ height: 0, opacity: 0, marginBottom: 0 }}
      animate={{ height: 'auto', opacity: 1, marginBottom: 12 }}
      exit={{
        height: 0,
        opacity: 0,
        marginBottom: 0,
        transition: {
          height: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
          marginBottom: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
          opacity: { duration: 0.2, ease: 'easeOut' },
        },
      }}
      transition={{
        height: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
        marginBottom: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
        opacity: { duration: 0.2, ease: 'easeOut' },
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: sortableTransition ?? undefined,
        zIndex: isDragging ? 30 : menuOpen ? 50 : 1,
      }}
      className={`relative group ${isDragging ? 'opacity-50' : ''} ${isOpen || isSwiping ? 'overflow-hidden bg-muted/70 rounded-xl shadow-none' : 'overflow-hidden bg-transparent rounded-xl shadow-sm shadow-black/5 dark:shadow-black/20'} ${menuOpen ? 'shadow-sm border border-primary/30' : ''}`}
      data-habit-active={!isDone}
    >
      {/* Swipe Actions Layer (behind the card) */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center pr-2 gap-2 transition-opacity ${isOpen || isSwiping ? 'opacity-100 duration-200' : 'opacity-0 duration-200 delay-200'}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const MENU_W = 160;
            const MARGIN = 10;
            const vw = window.innerWidth;
            let left = rect.left + rect.width / 2 - MENU_W / 2;
            left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
            onMenuOpen(habit.id, rect.bottom + 6, left);
          }}
          className="flex items-center justify-center w-10 h-10 transition-colors rounded-full shadow-sm bg-background text-foreground hover:bg-background/80"
          title="More options"
          tabIndex={isOpen ? 0 : -1}
        >
          <EllipsisVertical className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onDelete();
            setIsOpen(false);
          }}
          className="flex items-center justify-center w-10 h-10 text-red-600 transition-colors bg-red-100 rounded-full shadow-sm dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
          title="Delete habit"
          tabIndex={isOpen ? 0 : -1}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Foreground Card (Swipeable on touch only) */}
      <motion.div
        drag={
          isDesktop || isDragging || isSortDragging || swipeBlocked
            ? false
            : 'x'
        }
        dragDirectionLock
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={{ x: isOpen ? -100 : 0 }}
        style={{ x, cursor: 'pointer' }}
        transition={{ type: 'spring', stiffness: 600, damping: 28, mass: 1 }}
        onClick={handleCardClick}
        className={`
          group relative flex flex-col gap-1.5 px-2 py-2 rounded-xl border border-border/50 transition-colors duration-200 cursor-pointer select-none
          ${isDone ? 'bg-card opacity-60' : 'bg-card md:hover:border-primary/40 active:border-primary/40'}
          ${isOpen || isSwiping ? 'bg-card' : 'bg-card'}
        `}
      >
        <div className="relative z-10 flex items-center justify-between gap-2 pl-1.5 pr-1">
          {/* Bullet — exact match to TaskList */}
          <div className="relative flex-shrink-0 w-7 h-7">
            <AnimatePresence initial={false}>
              {!isDone ? (
                <motion.div
                  key="fly"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDraggingRef.current) return;
                      onToggle(habit.id);
                    }}
                    className="flex items-center justify-center w-full h-full transition-colors text-muted-foreground/50 md:hover:text-primary"
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60"
                      ref={(el) => {
                        flyRefs.current[habit.id] = el;
                      }}
                      data-fly-ref="true"
                    >
                      <Fly size={24} y={-3} paused={paused} />
                    </div>                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="check"
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDraggingRef.current) return;
                      onToggle(habit.id);
                    }}
                  >
                    <CheckCircle2 className="text-green-500 w-6 h-6 drop-shadow-sm" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text & Tags & Goal Tracker */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Tags & Time */}
            {( (habit.tags && habit.tags.length > 0) || habit.startTime ) && (
              <div className="flex flex-wrap gap-1 mb-1">
                <AnimatePresence mode="popLayout">
                  {habit.startTime && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      className="inline-flex items-center gap-0.5 rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal text-amber-600 shadow-sm transition-colors dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                      key="task-time-tag"
                    >
                      <Clock className="w-2 h-2" />
                      <span>
                        {habit.startTime}
                        {habit.endTime && habit.endTime !== habit.startTime ? ` - ${habit.endTime}` : ''}
                      </span>
                      {habit.reminder && <Bell className="w-2 h-2" />}
                    </motion.span>
                  )}
                  {habit.tags?.map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{ duration: 0.2 }}
                        key={tagId}
                        className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal shadow-sm"
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          borderColor: `${tag.color}40`,
                        }}
                      >
                        {tag.name}
                      </motion.span>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
            <span
              className={`block text-sm font-semibold leading-snug break-words transition-colors duration-200 ${
                isDone
                  ? 'text-muted-foreground line-through decoration-2 opacity-80'
                  : 'text-foreground'
              }`}
            >
              {habit.text}
            </span>

            {/* Weekly Goal Progress Dots */}
            <div className="flex items-center gap-1 mt-1.5 pl-px">
              {(() => {
                const goal = habit.timesPerWeek || 7;

                // Effective completed dates for this view
                let allCompleted = [...(habit.completedDates || [])];
                if (isDone) {
                  if (!allCompleted.includes(date)) allCompleted.push(date);
                } else {
                  allCompleted = allCompleted.filter((d) => d !== date);
                }

                // Helper: get Sun-Sat week dates for a given date
                const getWeekDates = (refDate: string) => {
                  const d = new Date(refDate);
                  const dow = d.getDay();
                  const sun = new Date(d);
                  sun.setDate(d.getDate() - dow);
                  sun.setHours(0, 0, 0, 0);
                  const dates: string[] = [];
                  for (let i = 0; i < 7; i++) {
                    const wd = new Date(sun);
                    wd.setDate(sun.getDate() + i);
                    dates.push(wd.toISOString().split('T')[0]);
                  }
                  return dates;
                };

                // Completions this week
                const weekDates = getWeekDates(date);
                const completedThisWeek = weekDates.filter((d) =>
                  allCompleted.includes(d),
                ).length;

                // Weekly streak: consecutive weeks (backwards) where goal was met
                // If current week isn't complete yet, skip it and count from last week
                let weekStreak = 0;
                const currentWeekMet = completedThisWeek >= goal;
                let checkDate = date;

                if (currentWeekMet) {
                  // Current week counts toward streak
                  weekStreak++;
                  const prev = new Date(weekDates[0]);
                  prev.setDate(prev.getDate() - 1);
                  checkDate = prev.toISOString().split('T')[0];
                } else {
                  // Skip current week, start counting from previous week
                  const prev = new Date(weekDates[0]);
                  prev.setDate(prev.getDate() - 1);
                  checkDate = prev.toISOString().split('T')[0];
                }

                while (true) {
                  const wk = getWeekDates(checkDate);
                  const count = wk.filter((d) =>
                    allCompleted.includes(d),
                  ).length;
                  if (count >= goal) {
                    weekStreak++;
                    const prev = new Date(wk[0]);
                    prev.setDate(prev.getDate() - 1);
                    checkDate = prev.toISOString().split('T')[0];
                  } else {
                    break;
                  }
                }

                return (
                  <>
                    {Array.from({ length: goal }).map((_, i) => {
                      const isFilled = i < completedThisWeek;
                      return (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 flex-shrink-0 ${
                            isFilled
                              ? 'bg-green-500 border-green-600 shadow-sm shadow-green-500/20'
                              : 'bg-muted border-border/50'
                          }`}
                        />
                      );
                    })}
                    {weekStreak > 0 && (
                      <span className="inline-flex items-center gap-0.5 ml-1 text-muted-foreground/50">
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-[11px] font-semibold text-muted-foreground/60">
                          {weekStreak} {weekStreak === 1 ? 'week' : 'weeks'}
                        </span>
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* 3-dots menu button — desktop only, shows on hover */}
        <div className="absolute z-20 hidden transition-opacity -translate-y-1/2 md:group-hover:block right-2 top-1/2">
          <button
            ref={menuBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              if (isDraggingRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const MENU_W = 160;
              const MARGIN = 10;
              const vw = window.innerWidth;
              let left = rect.left + rect.width / 2 - MENU_W / 2;
              left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
              onMenuOpen(habit.id, rect.bottom + 6, left);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-2 transition-colors rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/80"
            title="Options"
            aria-label="Options"
          >
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
