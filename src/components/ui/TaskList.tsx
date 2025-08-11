'use client';

import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
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
  visuallyCompleted, // <- NEW
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode; // <- pass state
  visuallyCompleted?: Set<string>; // <- NEW
}) {
  const vSet = visuallyCompleted ?? new Set<string>();

  return (
    <>
      <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
        <h2 className="mb-6 text-2xl font-bold">המשימות שלך היום:</h2>
        <div className="space-y-2">
          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);

            return (
              <div
                key={task.id}
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
                </div>
              </div>
            );
          })}
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
