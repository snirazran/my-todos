'use client';

import { CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';

export interface HistoryTask {
  id: string;
  text: string;
  completed: boolean;
}

export default function HistoryTaskList({
  date,
  tasks,
  toggle,
  renderBullet,
  visuallyCompleted,
}: {
  date: string; // YYYY-MM-DD
  tasks: HistoryTask[];
  toggle: (date: string, id: string, completed?: boolean) => void;
  renderBullet?: (
    key: string, // unique key you can attach the ref to
    task: HistoryTask,
    isVisuallyDone: boolean
  ) => React.ReactNode;
  visuallyCompleted?: Set<string>;
}) {
  const vSet = visuallyCompleted ?? new Set<string>();

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {tasks.map((task, i) => {
        const key = `${date}::${task.id}`;
        const isDone = task.completed || vSet.has(key);

        return (
          <div
            key={key}
            onClick={() => toggle(date, task.id)}
            className="p-3 transition-all duration-200 cursor-pointer rounded-xl group bg-white/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700"
            style={{
              animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
              animationFillMode: 'both',
            }}
          >
            <div className="flex items-center gap-3">
              {/* bullet */}
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
                      {renderBullet ? renderBullet(key, task, false) : null}
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
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* label */}
              <motion.span
                className={`text-sm md:text-base transition-colors duration-200 ${
                  isDone
                    ? 'text-slate-400 line-through dark:text-slate-500'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
                transition={{ duration: 0.18 }}
              >
                {task.text}
              </motion.span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
