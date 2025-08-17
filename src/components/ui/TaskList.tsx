// src/components/ui/TaskList.tsx
'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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
  onAddRequested, // NEW
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode;
  visuallyCompleted?: Set<string>;
  onAddRequested: (prefill: string, insertAfterIndex: number | null) => void; // NEW
}) {
  const vSet = visuallyCompleted ?? new Set<string>();
  const [inlineOpen, setInlineOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const openInline = () => setInlineOpen(true);
  const closeInline = () => {
    setDraft('');
    setInlineOpen(false);
  };
  const fireAdd = () => {
    if (!draft.trim()) return;
    onAddRequested(draft.trim(), null);
    closeInline();
  };

  return (
    <>
      <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
        <h2 className="mb-6 text-2xl font-bold">המשימות שלך היום:</h2>

        <div className="space-y-1">
          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);

            return (
              <div
                key={task.id}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() =>
                  setHoverIndex((idx) => (idx === i ? null : idx))
                }
              >
                {/* row */}
                <div
                  onClick={() => toggle(task.id)}
                  className="p-4 transition-all duration-200 cursor-pointer rounded-xl group hover:bg-slate-50 dark:hover:bg-slate-700"
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
                            >
                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <motion.span
                      className="text-lg"
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

                    {/* Desktop inline “+ insert here” */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddRequested('', i); // insert after this row
                      }}
                      title="הוסף כאן"
                      className={[
                        'ml-auto hidden md:flex items-center gap-1 text-violet-700',
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                      ].join(' ')}
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-sm">הוסף כאן</span>
                    </button>
                  </div>
                </div>

                {/* thin divider with small + when hovering BETWEEN items */}
                {hoverIndex === i && (
                  <div className="hidden md:block">
                    <button
                      onClick={() => onAddRequested('', i)}
                      className="flex items-center justify-center w-full py-1 my-1 text-xs transition text-violet-700/80 hover:text-violet-800"
                      title="הוסף משימה כאן"
                    >
                      <Plus className="w-4 h-4 mr-1" /> הוסף משימה כאן
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* persistent “Add a task +” row */}
          {!inlineOpen ? (
            <button
              onClick={openInline}
              className="flex items-center justify-center w-full gap-2 px-4 py-3 mt-2 text-violet-700 bg-violet-50/70 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 rounded-xl"
            >
              <Plus className="w-5 h-5" /> הוסף משימה
            </button>
          ) : (
            <div className="px-4 py-3 mt-2 bg-slate-50 dark:bg-slate-700 rounded-xl">
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="שם משימה…"
                  className="flex-1 px-3 py-2 bg-white border rounded-md dark:bg-slate-800 border-slate-200 dark:border-slate-600"
                />
                <button
                  onClick={fireAdd}
                  className="px-3 py-2 text-white rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
                  disabled={!draft.trim()}
                >
                  הוסף
                </button>
                <button
                  onClick={closeInline}
                  className="px-3 py-2 rounded-md bg-slate-200 dark:bg-slate-600"
                  title="ביטול"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                השלב הבא: בחירת יום וחזרה במודאל
              </p>
            </div>
          )}
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 כל הכבוד! 🎉</h3>
          <p className="text-lg">השלמת את כל המשימות להיום!</p>
        </div>
      )}
    </>
  );
}
