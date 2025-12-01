'use client';

import {
  CheckCircle2,
  Circle,
  EllipsisVertical,
  CalendarCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { AddTaskButton } from '@/components/ui/AddTaskButton';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
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
}) {
  const vSet = visuallyCompleted ?? new Set<string>();

  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    kind: 'regular' | 'weekly' | 'backlog';
  } | null>(null);

  React.useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  // Listen for other menus opening to auto-close this one
  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenuFor((curr) => (curr && curr !== id ? null : curr));
    };
    window.addEventListener('task-menu-open', closeIfOther as EventListener);
    return () =>
      window.removeEventListener(
        'task-menu-open',
        closeIfOther as EventListener
      );
  }, []);

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
      setMenuFor(null);
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
      setMenuFor(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' = dialog
    ? taskKind(dialog.task)
    : 'regular';

  return (
    <>
      <div
        dir="ltr"
        className="px-6 pt-6 pb-4 overflow-visible rounded-2xl bg-white/85 dark:bg-slate-900/75 backdrop-blur-xl ring-1 ring-slate-200/80 dark:ring-slate-800/70 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
      >
        {/* Header with Badge */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="flex items-center gap-3 text-xl font-bold md:text-2xl text-slate-900 dark:text-white">
            <CalendarCheck className="w-6 h-6 md:w-7 md:h-7 text-violet-500" />
            Your Tasks
          </h2>
          {tasks.length > 0 && (
            <span className="px-3 py-1 text-xs font-bold rounded-full text-slate-500 bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
              {tasks.length} Today
            </span>
          )}
        </div>

        <div className="pb-2 space-y-3 overflow-visible min-h-[100px]">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed text-slate-400 border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 rounded-xl">
              <CalendarCheck className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No tasks for today.</p>
              <p className="mt-1 text-xs opacity-60">
                Add one below to get started!
              </p>
            </div>
          )}

          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);
            const isMenuOpen = menuFor === task.id;

            return (
              <div
                key={task.id}
                // IMPORTANT: Z-Index logic here fixes the clipping/overlap issue
                className={`group relative transition-all duration-200 ${
                  isMenuOpen ? 'z-50' : 'z-auto'
                }`}
                style={{
                  // Ensure active menu item stays on top of subsequent items
                  zIndex: isMenuOpen ? 50 : 1,
                }}
              >
                {/* Row */}
                <div
                  onClick={() => toggle(task.id)}
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
                    animation: `fadeInUp 0.4s ease-out ${i * 0.05}s forwards`,
                    opacity: 0,
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
                                toggle(task.id, true);
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
                              toggle(task.id, false);
                            }}
                          >
                            <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <motion.span
                    className="flex-1 text-base font-medium md:text-lg"
                    animate={{
                      color: isDone ? 'rgb(148 163 184)' : 'rgb(30 41 59)', // slate-400 vs slate-800
                      textDecorationLine: isDone ? 'line-through' : 'none',
                      opacity: isDone ? 0.8 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    {task.text}
                  </motion.span>

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
                        // Dispatch event to close other menus
                        window.dispatchEvent(
                          new CustomEvent('task-menu-open', {
                            detail: { id: `task:${task.id}` },
                          })
                        );
                        setMenuFor((prev) =>
                          prev === task.id ? null : task.id
                        );
                      }}
                    >
                      <EllipsisVertical className="w-5 h-5" />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {isMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.1 }}
                          className="absolute right-0 top-full mt-2 z-[100] w-48 rounded-xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-700/70 dark:bg-slate-900 overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-1">
                            <button
                              className="flex items-center justify-start w-full gap-2 px-3 py-2 text-sm font-medium text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => {
                                setMenuFor(null);
                                setDialog({
                                  task,
                                  kind: taskKind(task) as
                                    | 'regular'
                                    | 'weekly'
                                    | 'backlog',
                                });
                              }}
                            >
                              Delete Task
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            );
          })}

          <div className={tasks.length ? 'mt-8' : 'mt-6'}>
            <AddTaskButton
              onClick={() => onAddRequested('', null, { preselectToday: true })}
            />
          </div>
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 All Clear! 🎉</h3>
          <p className="text-lg opacity-90">
            You've finished everything for today.
          </p>
        </div>
      )}

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
