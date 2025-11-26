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
      window.removeEventListener('task-menu-open', closeIfOther as EventListener);
  }, []);

  const taskKind = (t: Task) => {
    if (t.type === 'weekly') return 'weekly';
    if (t.type === 'backlog') return 'backlog';
    if (!t.type && weeklyIds.has(t.id)) return 'weekly';
    return t.type ?? 'regular';
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

  return (
    <>
      <div
        dir="ltr"
        className="px-6 pt-6 pb-4 bg-white shadow-lg rounded-2xl dark:bg-slate-800 overflow-visible"
      >
        <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
          Your tasks today:
        </h2>

        <div className="space-y-3 pb-2 overflow-visible">
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
                  className="p-4 transition-colors duration-200 cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
                  style={{
                    touchAction: 'pan-y',
                    animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                    animationFillMode: 'both',
                    overflow: 'visible',
                  }}
                >
                  <div className="flex items-center gap-4">
                    {/* Bullet with animated swap */}
                    <div className="relative flex-shrink-0 w-6 h-6">
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
                          className="absolute left-1/2 top-11 z-[60] w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="flex w-full items-center justify-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700"
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

          <div className="mt-20">
            <AddTaskButton
              onClick={() => onAddRequested('', null, { preselectToday: true })}
            />
          </div>
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 Well done! 🎉</h3>
          <p className="text-lg">You completed all tasks for today!</p>
        </div>
      )}

      <DeleteDialog
        open={!!dialog}
        variant={(dialog?.kind as any) ?? 'regular'}
        itemLabel={dialog?.task.text}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialog?.kind === 'weekly' || dialog?.kind === 'regular'
            ? confirmDeleteToday
            : undefined
        }
        onDeleteAll={
          dialog?.kind === 'weekly'
            ? confirmDeleteWeek
            : dialog?.kind === 'backlog'
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
