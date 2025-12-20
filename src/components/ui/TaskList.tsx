import {
  CheckCircle2,
  Circle,
  EllipsisVertical,
  CalendarCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import useSWR from 'swr';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import TaskMenu from '../board/TaskMenu';
import TagPopup from '@/components/ui/TagPopup';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
  tags?: string[];
}

export default function TaskList({
  tasks,
  toggle,
  showConfetti,
  renderBullet,
  visuallyCompleted,
  onAddRequested,
  weeklyIds = new Set<string>(),
  onDeleteToday,
  onDeleteFromWeek,
  onDoLater,
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode;
  visuallyCompleted?: Set<string>;
  onAddRequested: (
    prefill: string,
    insertAfterIndex: number | null,
    opts?: { preselectToday?: boolean }
  ) => void;

  weeklyIds?: Set<string>;
  onDeleteToday: (taskId: string) => Promise<void> | void;
  onDeleteFromWeek: (taskId: string) => Promise<void> | void;
  onDoLater?: (taskId: string) => Promise<void> | void;
}) {
  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json())
  );
  const userTags: { id: string; name: string; color: string }[] =
    tagsData?.tags || [];

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first
    const byId = userTags.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    // Fallback: try to find by Name
    return userTags.find((t) => t.name === tagIdentifier);
  };

  const vSet = visuallyCompleted ?? new Set<string>();

  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [exitAction, setExitAction] = useState<{ id: string; type: 'later' } | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    kind: 'regular' | 'weekly' | 'backlog';
  } | null>(null);
  
  const [tagPopup, setTagPopup] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  // Listen for other menus opening to auto-close this one
  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenu((curr) => (curr && curr.id !== id ? null : curr));
    };

    window.addEventListener('task-menu-open', closeIfOther as EventListener);

    return () => {
      window.removeEventListener(
        'task-menu-open',
        closeIfOther as EventListener
      );
    };
  }, []);
  
  const handleTagSave = async (taskId: string, newTags: string[]) => {
      // Find the task to get its current state for type checking if needed, 
      // but for board/regular we can just use the board PUT endpoint or tasks PUT endpoint.
      // The PUT /api/tasks only toggles completion.
      // The PUT /api/tasks?view=board handles updates but requires `day` and `tasks` array.
      // Actually, we should probably add a dedicated endpoint or handle it in POST/PUT.
      
      // Let's check api/tasks/route.ts. PUT is for toggle daily.
      // Let's use the board PUT but we need to know the day or if it's backlog.
      
      // Alternatively, we can assume it's "Today" context for TaskList. 
      // "Today" means regular task with date=today OR weekly task.
      
      // It's tricky because /api/tasks PUT only does completion.
      // I should update /api/tasks PUT to also accept tags update if provided.
      
      // WAIT: I can just use the board endpoint if I know the day. 
      // But for weekly tasks it's day 0-6. For regular tasks it's also day 0-6 (mapped).
      
      // Let's modify /api/tasks PUT to allow updating tags for a specific task ID.
      
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

  const taskKind = (t: Task) => {
    const sourceType = t.type ?? t.origin ?? t.kind;
    if (sourceType === 'weekly') return 'weekly';
    if (sourceType === 'backlog') return 'backlog';
    if (sourceType === 'regular') return 'regular';
    return weeklyIds.has(t.id) ? 'weekly' : 'regular';
  };

  const confirmDeleteToday = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteToday(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWeek = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteFromWeek(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' = dialog
    ? taskKind(dialog.task)
    : 'regular';

  // --- NEW: Intercept toggle to update statistics ---
  const handleTaskToggle = (task: Task, forceState?: boolean) => {
    // Determine if we are completing the task (either explicitly true, or implicitly toggling from false)
    const isCompleting =
      forceState === true || (forceState === undefined && !task.completed);

    if (isCompleting) {
      // Fire and forget the stats update
      fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete_task',
          taskId: task.id,
        }),
      }).catch((err) => console.error('Failed to update stats', err));
    }

    // Call the original prop to update UI
    toggle(task.id, forceState);
  };
  // -------------------------------------------------

  return (
    <>
      <div
        dir="ltr"
        className="px-6 pt-6 pb-4 overflow-visible rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm"
      >
        {/* Header with Badge */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="flex items-center gap-3 text-xl font-black tracking-tight uppercase text-slate-800 dark:text-slate-100">
            <CalendarCheck className="w-6 h-6 md:w-7 md:h-7 text-violet-500" />
            Your Tasks
          </h2>
          {tasks.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 px-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {tasks.length}
            </span>
          )}
        </div>

        <div className="pb-2 space-y-3 overflow-visible min-h-[100px]">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed text-slate-400 border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30 rounded-xl">
              <CalendarCheck className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No tasks for today.</p>
              <p className="mt-1 text-xs opacity-60">
                Add one below to get started!
              </p>
            </div>
          )}

          <AnimatePresence initial={false} mode="popLayout">
            {tasks.map((task, i) => {
              const isDone = task.completed || vSet.has(task.id);
              const isMenuOpen = menu?.id === task.id;
              const isExitingLater = exitAction?.id === task.id && exitAction.type === 'later';

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={
                    isExitingLater
                      ? {
                          opacity: 0,
                          x: 200, // Fly RIGHT
                          scale: 0.8,
                          transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
                        }
                      : { opacity: 1, x: 0, y: 0 }
                  }
                  exit={
                    isExitingLater
                      ? { opacity: 0 } // Already animated out
                      : { opacity: 0, scale: 0.95 }
                  }
                  transition={{
                    layout: { type: 'spring', stiffness: 300, damping: 30 },
                  }}
                  key={task.id}
                  className={`group relative ${isMenuOpen ? 'z-50' : 'z-auto'}`}
                  style={{
                    zIndex: isMenuOpen ? 50 : isExitingLater ? 0 : 1, // Ensure exiting task is behind others or handled correctly
                  }}
                >
                  {/* Row */}
                  <div
                    // UPDATED: Use handleTaskToggle instead of toggle directly
                    onClick={() => handleTaskToggle(task)}
                    className={`
                    relative flex items-center gap-4 px-3 py-3.5 
                    transition-all duration-200 cursor-pointer rounded-xl 
                    border border-transparent hover:border-slate-200 dark:hover:border-slate-700
                    hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm
                    ${
                      isMenuOpen
                        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-md'
                        : ''
                    }
                  `}
                    style={{
                      touchAction: 'pan-y',
                    }}
                  >
                    {/* Bullet with animated swap */}
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
                            {renderBullet ? (
                              renderBullet(task, false)
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // UPDATED: Use handleTaskToggle with true
                                  handleTaskToggle(task, true);
                                }}
                                className="flex items-center justify-center w-full h-full transition-colors text-slate-300 hover:text-violet-500"
                              >
                                <Circle className="w-6 h-6" />
                              </button>
                            )}
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
                                // UPDATED: Use handleTaskToggle with false (undo)
                                handleTaskToggle(task, false);
                              }}
                            >
                              <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex-1 min-w-0">
                      <motion.span
                        className="block text-base font-medium md:text-lg"
                        animate={{
                          color: isDone ? 'rgb(148 163 184)' : 'rgb(30 41 59)',
                          textDecorationLine: isDone ? 'line-through' : 'none',
                          opacity: isDone ? 0.8 : 1,
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        {task.text}
                      </motion.span>
                      {task.tags && task.tags.length > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-1">
                                                    <AnimatePresence mode="popLayout">
                                                    {task.tags.map((tagId) => {
                                                      const tagDetails = getTagDetails(tagId);
                                                      if (!tagDetails) return null; // Don't show raw ID if tag is deleted
                                                      
                                                      const color = tagDetails.color;
                                                      const name = tagDetails.name;
                                                      
                                                      return (
                                                        <motion.span
                                                          layout
                                                          initial={{ opacity: 0, scale: 0.8 }}
                                                          animate={{ opacity: 1, scale: 1 }}
                                                          exit={{ opacity: 0, scale: 0 }}
                                                          transition={{ duration: 0.2 }}
                                                          key={tagId}
                                                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border shadow-sm ${
                                                            !color
                                                              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50'
                                                              : ''
                                                          }`}
                                                          style={
                                                            color
                                                              ? {
                                                                  backgroundColor: `${color}20`,
                                                                  color: color,
                                                                  borderColor: `${color}40`,
                                                                }
                                                              : undefined
                                                          }
                                                        >
                                                          {name}
                                                        </motion.span>
                                                      );
                                                    })}
                                                    </AnimatePresence>
                                                  </div>                      )}
                    </div>

                    {/* Actions */}
                    <div className="relative shrink-0">
                      <button
                        className={`
                        p-2 rounded-lg transition-colors
                        ${
                          isMenuOpen
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }
                      `}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const id = `task:${task.id}`;
                          window.dispatchEvent(
                            new CustomEvent('task-menu-open', {
                              detail: { id },
                            })
                          );
                          
                          setMenu((prev) => {
                            if (prev?.id === task.id) return null;
                            const MENU_W = 160;
                            const MENU_H = 80; // Two items
                            const GAP = 8;
                            const MARGIN = 10;
                            const vw = window.innerWidth;
                            const vh = window.innerHeight;
                            
                            let left = rect.left + rect.width / 2 - MENU_W / 2;
                            left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
                            
                            let top = rect.bottom + GAP;
                            if (top + MENU_H > vh - MARGIN) {
                              top = rect.top - MENU_H - GAP;
                            }
                            return { id: task.id, top, left };
                          });
                        }}
                      >
                        <EllipsisVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isDone={menu ? (tasks.find(t => t.id === menu.id)?.completed || vSet.has(menu.id)) : false}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="second"
        onDoLater={
          onDoLater
            ? () => {
                if (menu) {
                  const id = menu.id;
                  setMenu(null);
                  setExitAction({ id, type: 'later' });
                  onDoLater(id);
                }
              }
            : undefined
        }
        onDelete={() => {
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) {
              setDialog({
                task: t,
                kind: taskKind(t) as 'regular' | 'weekly' | 'backlog',
              });
            }
          }
          setMenu(null);
        }}
      />

      <TagPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={tasks.find(t => t.id === tagPopup.taskId)?.tags}
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
          dialogVariant !== 'backlog' ? confirmDeleteToday : undefined
        }
        onDeleteAll={
          dialogVariant === 'weekly'
            ? confirmDeleteWeek
            : dialogVariant === 'backlog'
            ? confirmDeleteToday
            : undefined
        }
      />

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}