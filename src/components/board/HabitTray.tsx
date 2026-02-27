import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, animate, PanInfo } from 'framer-motion';
import { X, CalendarClock, Trash2, Repeat, EllipsisVertical, CheckCircle2 } from 'lucide-react';
import { Task } from './helpers';
import TaskMenu from './TaskMenu';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { EditHabitDaysDialog } from '@/components/ui/EditHabitDaysDialog';
import TagPopup from '@/components/ui/TagPopup';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  habits: Task[];
  onToggle: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onEditGoal: (id: string, newGoal: number) => void;
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
  onAddRequested,
  userTags = [],
  date,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () =>
      setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Menu & Dialog State
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [editItem, setEditItem] = useState<Task | null>(null);
  const [editGoalItem, setEditGoalItem] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

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

  const mobileVariants = {
    initial: { y: '100%', opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  };

  const desktopVariants = {
    initial: { x: '-100%', opacity: 0 },
    animate: { x: '0%', opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* The Vertical Tray/Drawer */}
          <motion.div
            variants={isDesktop ? desktopVariants : mobileVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            drag={!isDesktop ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(e, { offset, velocity }) => {
              if (offset.y > 100 || velocity.y > 500) {
                onClose();
              }
            }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
              mass: 0.8,
            }}
            className={`
                fixed z-[90] flex flex-col bg-card/95 border-r border-border/50 shadow-2xl backdrop-blur-3xl overflow-hidden
                
                /* Mobile: Bottom Sheet */
                inset-x-0 bottom-0 top-[15vh] rounded-t-[32px] border-t
                
                /* Desktop: Left Sidebar */
                md:inset-y-0 md:left-0 md:right-auto md:w-[420px] md:top-0 md:bottom-0 md:rounded-none md:border-t-0
            `}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle (Mobile Only) */}
            {!isDesktop && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full z-50 pointer-events-none" />
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-8 md:px-8 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-sm">
                  <CalendarClock size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-foreground uppercase">
                    Habits
                  </h3>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                    {habits.length} {habits.length === 1 ? 'Habit' : 'Habits'} Active
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground transition-all active:scale-95"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Vertical Scroll Content */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 md:px-6 pb-24 flex flex-col gap-3"
            >
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
                  <Repeat size={16} strokeWidth={3} />
                </div>
                <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                  Add New Habit
                </span>
              </button>
            </div>

            {/* Footer gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
          </motion.div>

          <TaskMenu
            menu={menu}
            onClose={() => setMenu(null)}
            isHabit
            addTagsPosition="first"
            onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
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
      )}
    </AnimatePresence>
  );
});

function HabitTrayItem({
  habit,
  isDone,
  onMenuOpen,
  menuOpen,
  tags,
  date,
}: {
  habit: Task;
  isDone: boolean;
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
        menuOpen && "ring-2 ring-primary/20 shadow-xl z-10"
      )}
    >
      <motion.div
        drag={isDesktop ? false : "x"}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="flex items-center gap-4 p-4 cursor-default select-none"
      >
        {/* Bullet - non-interactive */}
        <div className="relative w-7 h-7 shrink-0 pointer-events-none">
          <AnimatePresence initial={false} mode="wait">
            {!isDone ? (
              <motion.div
                key="fly"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center text-muted-foreground/40"
              >
                <Fly size={28} y={-4} />
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
          <span className={cn(
            "block text-base font-bold transition-all",
            isDone ? "text-muted-foreground line-through" : "text-foreground"
          )}>
            {habit.text}
          </span>

          {/* Dots & Streak */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex gap-1">
              {(() => {
                const goal = habit.timesPerWeek || 7;
                let allCompleted = [...(habit.completedDates || [])];
                if (isDone && !allCompleted.includes(date)) allCompleted.push(date);
                else if (!isDone) allCompleted = allCompleted.filter(d => d !== date);

                const dDate = new Date(date);
                const sun = new Date(dDate);
                sun.setDate(dDate.getDate() - dDate.getDay());
                sun.setHours(0,0,0,0);
                
                const weekDates: string[] = [];
                for (let i = 0; i < 7; i++) {
                  const d = new Date(sun);
                  d.setDate(sun.getDate() + i);
                  weekDates.push(d.toISOString().split('T')[0]);
                }
                
                const completedThisWeek = weekDates.filter(d => allCompleted.includes(d)).length;

                return Array.from({ length: goal }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full border transition-all",
                      i < completedThisWeek 
                        ? "bg-green-500 border-green-600 scale-110 shadow-sm" 
                        : "bg-muted border-border/50"
                    )}
                  />
                ));
              })()}
            </div>
            
            {(() => {
              let allCompleted = [...(habit.completedDates || [])];
              if (isDone && !allCompleted.includes(date)) allCompleted.push(date);
              else if (!isDone) allCompleted = allCompleted.filter(d => d !== date);

              if (allCompleted.length === 0) return null;
              
              let streak = 0;
              let curr = new Date(date);
              const checkDate = (d: Date) => d.toISOString().split('T')[0];
              
              while (true) {
                const s = checkDate(curr);
                if (allCompleted.includes(s)) {
                  streak++;
                  curr.setDate(curr.getDate() - 1);
                } else {
                  break;
                }
              }

              if (streak === 0) return null;

              return (
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter flex items-center gap-0.5">
                  🔥 {streak}
                </span>
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
