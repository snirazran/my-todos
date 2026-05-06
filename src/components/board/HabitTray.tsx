import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, animate, PanInfo } from 'framer-motion';
import { CalendarClock, CheckCircle2, EllipsisVertical, Clock, Bell } from 'lucide-react';
import { Task } from './helpers';
import TaskMenu from './TaskMenu';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { EditHabitDaysDialog } from '@/components/ui/EditHabitDaysDialog';
import TagPopup from '@/components/ui/TagPopup';
import { ScheduleTaskDialog } from '@/components/ui/ScheduleTaskDialog';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { SideOpenTray } from '@/components/ui/SideOpenTray';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  habits: Task[];
  onToggle: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onEditGoal: (id: string, newGoal: number) => void;
  onSchedule?: (taskId: string, data: { startTime: string; endTime: string; reminder: string }) => void;
  onAddRequested: () => void;
  userTags?: { id: string; name: string; color: string }[];
  date: string;
}

export default React.memo(function HabitTray({
  isOpen,
  onClose,
  habits,
  onToggle,
  onEdit,
  onDelete,
  onEditGoal,
  onSchedule,
  onAddRequested,
  userTags = [],
  date,
}: Props) {
  // Menu & Dialog State
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [editItem, setEditItem] = useState<Task | null>(null);
  const [editGoalItem, setEditGoalItem] = useState<Task | null>(null);
  const [scheduleDialog, setScheduleDialog] = useState<{ task: Task } | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

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

  return (
    <>
      <SideOpenTray
        isOpen={isOpen}
        onClose={onClose}
        title="Habits"
        subtitle={`${habits.length} ${habits.length === 1 ? 'Habit' : 'Habits'} Active`}
        icon={<CalendarClock size={24} strokeWidth={2.5} />}
        iconContainerClassName="bg-emerald-500/10 text-emerald-500"
        lockScroll={true}
      >
        <div className="h-3 shrink-0" aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          {habits.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-30 min-h-[300px]">
              <CalendarClock size={64} strokeWidth={1} />
              <p className="text-sm font-bold uppercase tracking-widest text-center px-8">
                Build your routine. Add your first habit!
              </p>
            </div>
          ) : (
            habits.map((h) => (
              <HabitTrayItem
                key={h.id}
                habit={h}
                isDone={h.completed || (h.completedDates ?? []).includes(date)}
                onToggle={onToggle}
                onMenuOpen={(id, top, left) => setMenu({ id, top, left })}
                menuOpen={menu?.id === h.id}
                tags={userTags}
                date={date}
              />
            ))
          )}
        </AnimatePresence>

        {/* Add Habit Button inside list */}
        <button
          onClick={onAddRequested}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 transition-all group mt-2"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center transition-transform group-hover:scale-110">
            <CalendarClock size={16} strokeWidth={3} />
          </div>
          <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
            Add New Habit
          </span>
        </button>
        <div className="h-10 shrink-0" aria-hidden />
      </SideOpenTray>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isHabit
        addTagsPosition="first"
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        onSchedule={() => {
          const h = habits.find((h) => h.id === menu?.id);
          if (h) setScheduleDialog({ task: h });
          setMenu(null);
        }}
        onChangeDays={() => {
          const h = habits.find((h) => h.id === menu?.id);
          if (h) setEditGoalItem(h);
          setMenu(null);
        }}
        onEdit={(id) => {
          const h = habits.find((it) => it.id === id);
          if (h) setEditItem(h);
          setMenu(null);
        }}
        onDelete={() => {
          if (menu) {
            const h = habits.find((it) => it.id === menu.id);
            if (h) setConfirmItem(h);
          }
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
            setBusy(true);
            await onSchedule(scheduleDialog.task.id, data);
            setBusy(false);
            setScheduleDialog(null);
          }}
        />
      )}

      <TagPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={habits.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />

      {editItem && (
        <EditTaskDialog
          open={!!editItem}
          initialText={editItem.text}
          title="Edit Habit"
          subtitle="Make changes to your habit below."
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={async (newText) => {
            setBusy(true);
            await onEdit(editItem.id, newText);
            setBusy(false);
            setEditItem(null);
          }}
        />
      )}

      {editGoalItem && (
        <EditHabitDaysDialog
          open={!!editGoalItem}
          taskId={editGoalItem.id}
          taskLabel={editGoalItem.text}
          initialGoal={editGoalItem.timesPerWeek ?? 7}
          busy={busy}
          onClose={() => setEditGoalItem(null)}
          onSave={async (newGoal) => {
            setBusy(true);
            await onEditGoal(editGoalItem.id, newGoal);
            setBusy(false);
            setEditGoalItem(null);
          }}
        />
      )}

      <DeleteDialog
        open={!!confirmItem}
        variant="habit"
        itemLabel={confirmItem?.text}
        busy={busy}
        onClose={() => {
          if (!busy) setConfirmItem(null);
        }}
        onDeleteAll={async () => {
          if (confirmItem) {
            setBusy(true);
            await onDelete(confirmItem.id);
            setBusy(false);
            setConfirmItem(null);
          }
        }}
      />
    </>
  );
});

function HabitTrayItem({
  habit,
  isDone,
  onToggle,
  onMenuOpen,
  menuOpen,
  tags,
  date,
}: {
  habit: Task;
  isDone: boolean;
  onToggle: (id: string) => void;
  onMenuOpen: (id: string, top: number, left: number) => void;
  menuOpen: boolean;
  tags: { id: string; name: string; color: string }[];
  date: string;
}) {
  const x = useMotionValue(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset < -60 || velocity < -200) {
      // Find the trigger button relative to the target element if possible, or use a fallback
      const rect = event.target.getBoundingClientRect();
      const MENU_W = 160;
      const MARGIN = 10;
      const vw = window.innerWidth;
      let left = rect.left + rect.width / 2 - MENU_W / 2;
      left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
      onMenuOpen(habit.id, rect.bottom + 6, left);
    }
    animate(x, 0, { type: 'spring', stiffness: 600, damping: 28 });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "relative rounded-2xl border border-border/50 bg-card transition-all m-0.5",
        isDone ? "opacity-60" : "hover:border-border shadow-sm",
        menuOpen && "border-primary/30 shadow-sm z-10"
      )}
    >
      <motion.div
        drag={isDesktop ? false : "x"}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="flex items-center gap-3 p-3 cursor-default select-none"
      >
        {/* Bullet - non-interactive */}
        <div className="relative w-9 h-9 shrink-0 pointer-events-none">
          <AnimatePresence initial={false} mode="wait">
            {!isDone ? (
              <motion.div
                key="fly"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center text-muted-foreground/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60">
                  <Fly size={32} y={-3} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="check"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {( (habit.tags && habit.tags.length > 0) || habit.startTime ) && (
            <div className="flex flex-wrap gap-1 mb-1">
              {habit.startTime && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 shadow-sm">
                  <Clock className="w-2.5 h-2.5" />
                  <span>
                    {habit.startTime}
                    {habit.endTime && habit.endTime !== habit.startTime ? ` - ${habit.endTime}` : ''}
                  </span>
                  {habit.reminder && <Bell className="w-2.5 h-2.5" />}
                </span>
              )}
              {habit.tags?.map((tagId) => {
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
          <span className={cn(
            "block min-w-0 whitespace-pre-wrap break-words text-sm font-semibold leading-snug transition-all",
            isDone ? "text-muted-foreground line-through" : "text-foreground"
          )}>
            {habit.text}
          </span>

          {/* Dots & Streak */}
          <div className="flex items-center gap-2 mt-2">
            {(() => {
              const goal = habit.timesPerWeek || 7;
              let allCompleted = [...(habit.completedDates || [])];
              if (isDone && !allCompleted.includes(date)) allCompleted.push(date);
              else if (!isDone) allCompleted = allCompleted.filter(d => d !== date);

              const getWeekDates = (refDate: string) => {
                const d = new Date(refDate);
                const dow = d.getDay();
                const sun = new Date(d);
                sun.setDate(d.getDate() - dow);
                sun.setHours(0,0,0,0);
                const dates: string[] = [];
                for (let i = 0; i < 7; i++) {
                  const wd = new Date(sun);
                  wd.setDate(sun.getDate() + i);
                  dates.push(wd.toISOString().split('T')[0]);
                }
                return dates;
              };

              const weekDates = getWeekDates(date);
              const completedThisWeek = weekDates.filter(d => allCompleted.includes(d)).length;

              // Weekly streak
              let weekStreak = 0;
              let checkDate = date;
              while (true) {
                const wk = getWeekDates(checkDate);
                const count = wk.filter(d => allCompleted.includes(d)).length;
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
                  <div className="flex gap-1">
                    {Array.from({ length: goal }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-2.5 h-2.5 rounded-full border transition-all",
                          i < completedThisWeek
                            ? "bg-green-500 border-green-600 shadow-sm"
                            : "bg-muted border-border/50"
                        )}
                      />
                    ))}
                  </div>
                  {weekStreak > 0 && (
                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter flex items-center gap-0.5">
                      🔥 {weekStreak}w
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Menu Trigger - Always visible */}
        <button
          id={`habit-menu-trigger-${habit.id}`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const MENU_W = 160;
            const MARGIN = 10;
            const vw = window.innerWidth;
            let left = rect.left + rect.width / 2 - MENU_W / 2;
            left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
            onMenuOpen(habit.id, rect.bottom + 6, left);
          }}
          className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <EllipsisVertical size={18} />
        </button>
      </motion.div>
    </motion.div>
  );
}
