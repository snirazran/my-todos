'use client';

import { CheckCircle2, Circle, Plus, X, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';

interface Task {
  id: string;
  text: string;
  completed: boolean;
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

  /** IDs that belong to the weekly template for *today* */
  weeklyIds?: Set<string>;
  /** remove from *today only* */
  onDeleteToday: (taskId: string) => Promise<void> | void;
  /** remove from the weekly template (and today/future days) */
  onDeleteFromWeek: (taskId: string) => Promise<void> | void;
}) {
  const vSet = visuallyCompleted ?? new Set<string>();

  // hover state for separators (desktop only)
  const [hoverSep, setHoverSep] = useState<number | null>(null);

  // delete modal
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const isWeekly = (t: Task) => weeklyIds.has(t.id);

  const confirmDeleteToday = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await onDeleteToday(toDelete.id);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWeek = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await onDeleteFromWeek(toDelete.id);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        dir="ltr"
        className="p-6 bg-white shadow-lg rounded-2xl dark:bg-slate-800"
      >
        <h2 className="mb-6 text-2xl font-bold">Your tasks today:</h2>

        <div className="space-y-0">
          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);

            return (
              <div key={task.id} className="group">
                {/* Row */}
                <div
                  onClick={() => toggle(task.id)}
                  className="p-4 transition-colors duration-200 cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
                  style={{
                    animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                    animationFillMode: 'both',
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

                    {/* delete button (shows on hover on desktop, always visible on touch) */}
                    <button
                      className="p-2 transition-opacity rounded-md opacity-0 hover:bg-slate-100 dark:hover:bg-slate-600 md:opacity-0 md:group-hover:opacity-100"
                      title="Delete task"
                      aria-label="Delete task"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(task);
                      }}
                    >
                      <Trash2 className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Between i and i+1: open QuickAdd directly */}
                {i < tasks.length - 1 && (
                  <SeparatorHover
                    index={i}
                    hoverSep={hoverSep}
                    setHoverSep={setHoverSep}
                    onOpen={() => {
                      // Open the sheet immediately, preselect “today”, insert after this index
                      onAddRequested('', i, { preselectToday: true });
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Bottom “Add task” → open QuickAdd immediately */}
          <button
            onClick={() => onAddRequested('', null, { preselectToday: true })}
            className="flex items-center justify-center w-full gap-2 px-4 py-3 mt-2 rounded-xl bg-violet-50/70 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30"
          >
            <Plus className="w-5 h-5" /> Add task
          </button>
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 Well done! 🎉</h3>
          <p className="text-lg">You completed all tasks for today!</p>
        </div>
      )}

      {/* delete modal */}
      <AnimatePresence>
        {toDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setToDelete(null);
            }}
          >
            <div
              className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-5 shadow-lg dark:bg-slate-800"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="mb-1 text-lg font-semibold">
                    {toDelete && isWeekly(toDelete)
                      ? 'Delete weekly task'
                      : 'Delete task for today'}
                  </h4>
                  <p className="mb-4 text-slate-600 dark:text-slate-300">
                    {toDelete && isWeekly(toDelete)
                      ? 'Remove only from today, or delete from this week entirely?'
                      : 'Delete this task from today? This action is permanent.'}
                  </p>
                </div>
                <button
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setToDelete(null)}
                  aria-label="Close"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600"
                  onClick={() => setToDelete(null)}
                  disabled={busy}
                >
                  Cancel
                </button>

                {toDelete && isWeekly(toDelete) ? (
                  <>
                    <button
                      className="px-4 py-2 text-white rounded-lg bg-rose-600 disabled:opacity-60"
                      onClick={confirmDeleteToday}
                      disabled={busy}
                      title="Remove only from today's list"
                    >
                      Remove today only
                    </button>
                    <button
                      className="px-4 py-2 text-white rounded-lg bg-rose-700 disabled:opacity-60"
                      onClick={confirmDeleteWeek}
                      disabled={busy}
                      title="Remove from weekly template and upcoming days"
                    >
                      Remove from this week
                    </button>
                  </>
                ) : (
                  <button
                    className="px-4 py-2 text-white rounded-lg bg-rose-600 disabled:opacity-60"
                    onClick={confirmDeleteToday}
                    disabled={busy}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

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

/* ────────────────────────────────────────────── */
/*  Subtle Trello-style hover rails + “+”        */
/* ────────────────────────────────────────────── */
function SeparatorHover({
  index,
  hoverSep,
  setHoverSep,
  onOpen,
}: {
  index: number;
  hoverSep: number | null;
  setHoverSep: React.Dispatch<React.SetStateAction<number | null>>;
  onOpen: () => void;
}) {
  return (
    <div
      className="relative h-1.5 select-none md:h-5"
      onMouseEnter={() => setHoverSep(index)}
      onMouseLeave={() => setHoverSep(null)}
    >
      <AnimatePresence>
        {hoverSep === index && (
          <motion.div
            className="absolute inset-0 z-10 items-center justify-center hidden pointer-events-none md:flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Rail />
            <motion.button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(); // opens QuickAdd
              }}
              className="pointer-events-auto mx-3 flex items-center justify-center rounded-full bg-white px-2.5 py-1 text-violet-700 shadow-sm ring-1 ring-violet-200/70 dark:bg-slate-800 dark:text-violet-300 dark:ring-violet-900/40"
              title="Add a task here"
              aria-label="Add a task here"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              whileHover={{ scale: 1.03 }}
            >
              <Plus className="w-5 h-5" />
            </motion.button>
            <Rail />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rail() {
  return (
    <div className="h-[2px] flex-1 overflow-hidden">
      <motion.div
        className="h-full text-violet-400 dark:text-violet-300"
        initial={{ width: '60%', opacity: 0.7 }}
        animate={{ width: '100%', opacity: 1 }}
        exit={{ width: '60%', opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 0 12px, transparent 12px 22px)',
          backgroundSize: '22px 2px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'center',
        }}
      />
    </div>
  );
}
