'use client';

import { CheckCircle2, Circle, EllipsisVertical } from 'lucide-react';
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
        <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
          Your tasks today:
        </h2>

        <div className="pb-2 space-y-3 overflow-visible">
          {tasks.length === 0 && (
            <div className="px-4 py-6 text-center border text-slate-500 rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              No tasks for today. <br></br>Add one to get started.
            </div>
          )}
          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);
            const isMenuOpen = menuFor === task.id;

            return (
              <div
                key={task.id}
                className={`group relative overflow-visible ${
                  isMenuOpen ? 'z-50' : 'z-0'
                }`}
              >
                {/* Row */}
                <div
                  onClick={() => toggle(task.id)}
                  className="px-2 py-4 transition-colors duration-200 cursor-pointer rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-800/70"
                  style={{
                    touchAction: 'pan-y',
                    animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                    animationFillMode: 'both',
                    overflow: 'visible',
                  }}
                >
                  <div className="flex items-center gap-4">
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
                                aria-label="Mark task complete"
                                title="Mark complete"
                              >
                                <Circle className="w-6 h-6 text-slate-400" />
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
                              stiffness: 420,
                              damping: 30,
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(task.id, false);
                              }}
                              aria-label="Mark task incomplete"
                              title="Mark incomplete"
                            >
                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <motion.span
                      className="flex-1 text-lg"
                      animate={
                        isDone
                          ? {
                              color: 'rgb(148 163 184)',
                              textDecorationColor: 'rgb(148 163 184)',
                            }
                          : { color: 'rgb(15 23 42)' }
                      }
                      transition={{ duration: 0.18 }}
                      style={{
                        textDecoration: isDone ? 'line-through' : 'none',
                        textDecorationThickness: isDone ? 2 : undefined,
                      }}
                    >
                      {task.text}
                    </motion.span>

                    {/* actions */}
                    <div className="relative z-40">
                      <button
                        className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600"
                        title="Task actions"
                        aria-label="Task actions"
                        onClick={(e) => {
                          e.stopPropagation();
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
                        <EllipsisVertical className="w-5 h-5 text-slate-500" />
                      </button>
                      {menuFor === task.id && (
                        <div
                          className="absolute right-0 top-12 z-[60] w-44 max-w-[82vw] rounded-xl border border-slate-200/80 bg-white/95 shadow-lg backdrop-blur md:w-48 dark:border-slate-700/70 dark:bg-slate-900/90"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="flex items-center justify-center w-full gap-2 px-3 py-2 text-sm font-medium text-slate-800 rounded-xl hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/70"
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
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className={tasks.length ? 'mt-20' : 'mt-12'}>
            <AddTaskButton
              onClick={() => onAddRequested('', null, { preselectToday: true })}
            />
          </div>
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 Well done! 🎉</h3>
          <p className="text-lg">You completed all tasks for today!</p>
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
            transform: translateY(20px);
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
