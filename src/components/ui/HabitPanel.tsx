'use client';

import React, { useEffect, useState } from 'react';
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  animate,
} from 'framer-motion';
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { Task } from '@/hooks/useTaskData';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { EditHabitDaysDialog } from '@/components/ui/EditHabitDaysDialog';

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
  tags: SavedTag[];
  flyRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  showCompleted: boolean;
  visuallyCompleted?: Set<string>;
  onAddRequested: (prefill: string, isHabit?: boolean) => void;
  date: string;
}

const DAYS_SHORT = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

export function HabitPanel({
  habits,
  onToggle,
  onEdit,
  onDelete,
  tags,
  flyRefs,
  showCompleted,
  visuallyCompleted,
  onAddRequested,
  date,
}: HabitPanelProps) {
  const [editingHabit, setEditingHabit] = React.useState<Task | null>(null);
  const [deletingHabit, setDeletingHabit] = React.useState<Task | null>(null);
  const [editingDaysHabit, setEditingDaysHabit] = React.useState<Task | null>(null);
  const [busy, setBusy] = React.useState(false);

  const visibleHabits = React.useMemo(() => {
    if (showCompleted) return habits;
    return habits.filter((h) => !h.completedDates?.includes(date));
  }, [habits, showCompleted, date]);

  if (habits.length === 0) {
    return (
      <div className="px-6 pb-4">
        <button
          onClick={() => onAddRequested('', true)}
          className="w-full flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all pt-8 group cursor-pointer"
        >
          <div className="flex items-center justify-center w-14 h-14 mb-3 transition-all border rounded-full bg-muted border-muted-foreground/10 md:grayscale md:opacity-70 opacity-100 grayscale-0 group-hover:grayscale-0 group-hover:opacity-100">
            <Fly size={32} y={-4} />
          </div>
          <p className="text-sm font-bold md:text-muted-foreground text-primary group-hover:text-primary transition-colors">
            No Habits Yet
          </p>
          <p className="mt-1 text-xs md:text-muted-foreground/60 text-muted-foreground group-hover:text-muted-foreground transition-colors max-w-[250px]">
            Tap here to create your first habit and build your daily routine!
          </p>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2 px-6 pb-24">
      <AnimatePresence mode="popLayout">
        {visibleHabits.map((habit) => (
          <HabitItem
            key={habit.id}
            habit={habit}
            isDone={
              habit.completed ||
              (habit.completedDates ?? []).includes(date) ||
              (visuallyCompleted ? visuallyCompleted.has(habit.id) : false)
            }
            onToggle={onToggle}
            onEdit={() => setEditingHabit(habit)}
            onDelete={() => setDeletingHabit(habit)}
            flyRefs={flyRefs}
            tags={tags}
          />
        ))}
      </AnimatePresence>

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
          initialDays={editingDaysHabit.daysOfWeek ?? []}
          busy={busy}
          onClose={() => setEditingDaysHabit(null)}
          onSave={async (newDays) => {
            setBusy(true);
            try {
              await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: editingDaysHabit.id, daysOfWeek: newDays }),
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
  onEdit,
  onDelete,
  flyRefs,
  tags,
}: {
  habit: Task;
  isDone: boolean;
  onToggle: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  flyRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  tags: SavedTag[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const isDraggingRef = React.useRef(false);
  const x = useMotionValue(0);

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsSwiping(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsSwiping(false);
    }, 100);

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
      layout
      initial={false}
      animate={{
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 400, damping: 30 },
      }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`relative group ${isOpen || isSwiping ? 'overflow-hidden bg-muted/70 rounded-xl shadow-none' : 'overflow-hidden bg-transparent rounded-xl shadow-sm shadow-black/5 dark:shadow-black/20'}`}
    >
      {/* Swipe Actions Layer (behind the card) */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center pr-2 gap-2 transition-opacity ${isOpen || isSwiping ? 'opacity-100 duration-200' : 'opacity-0 duration-200 delay-200'}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onEdit();
            setIsOpen(false);
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-background text-foreground shadow-sm hover:bg-background/80 transition-colors cursor-pointer"
          title="Edit habit"
          tabIndex={isOpen ? 0 : -1}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onDelete();
            setIsOpen(false);
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 shadow-sm transition-colors cursor-pointer"
          title="Delete habit"
          tabIndex={isOpen ? 0 : -1}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Foreground Card (Swipeable) */}
      <motion.div
        drag="x"
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
          relative flex flex-col gap-2 px-2 py-3.5 rounded-xl border border-border/50 transition-colors duration-200 cursor-pointer select-none
          ${isDone ? 'bg-card opacity-60' : 'bg-card hover:border-border/70'}
          ${isOpen || isSwiping ? 'bg-card' : 'bg-card'}
        `}
      >
        <div className="flex items-center justify-between gap-3 pl-2">
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
                      className="absolute inset-0 outline-none"
                      ref={(el) => {
                        flyRefs.current[habit.id] = el;
                      }}
                      data-fly-ref="true"
                    />
                    <Fly size={30} />
                  </button>
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
                    <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text & Tags & History Tracker */}
          <div className="flex-1 min-w-0">
            {/* Tags */}
            {habit.tags && habit.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {habit.tags.map((tagId) => {
                  const tag = tags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shadow-sm"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: `${tag.color}40`,
                      }}
                    >
                      {tag.name}
                    </span>
                  );
                })}
              </div>
            )}
            <span
              className={`block text-base font-medium md:text-lg transition-colors duration-200 ${
                isDone
                  ? 'text-muted-foreground line-through decoration-2 opacity-80'
                  : 'text-foreground'
              }`}
            >
              {habit.text}
            </span>

            {/* 7-Day Progress Indicator */}
            <div className="flex items-center gap-1.5 mt-2">
              {(() => {
                const weekDays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                const pastWeekDates = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (6 - i));
                  return {
                    dateStr: [
                      d.getFullYear(),
                      String(d.getMonth() + 1).padStart(2, '0'),
                      String(d.getDate()).padStart(2, '0'),
                    ].join('-'),
                    dayIdx: d.getDay(),
                    isToday: i === 6,
                  };
                });

                return pastWeekDates.map((info, i) => {
                  const isScheduled = (habit.daysOfWeek || []).includes(
                    info.dayIdx,
                  );
                  if (!isScheduled) return null;

                  const completedDates = habit.completedDates || [];
                  const isDayCompleted =
                    completedDates.includes(info.dateStr) ||
                    (info.isToday && isDone);

                  let dotColor = 'bg-muted text-muted-foreground/30'; // default: gray/untracked
                  if (info.isToday) {
                    if (isDone)
                      dotColor =
                        'bg-green-500 text-white shadow-sm shadow-green-500/25';
                  } else {
                    // Past day
                    if (isDayCompleted) {
                      dotColor =
                        'bg-green-500 text-white shadow-sm shadow-green-500/25';
                    } else {
                      // Only mark red if the habit was already active on that day
                      // (has any completedDate on or before this date)
                      const wasTracked = completedDates.some(
                        (d) => d <= info.dateStr,
                      );
                      if (wasTracked)
                        dotColor =
                          'bg-red-500 text-white shadow-sm shadow-red-500/25';
                      // else stays gray — habit is new, not tracked yet
                    }
                  }

                  return (
                    <div
                      key={i}
                      className={`
                        w-6 h-6 flex items-center justify-center rounded-full text-[9px] font-bold tracking-tighter
                        ${dotColor}
                      `}
                    >
                      {weekDays[info.dayIdx]}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
