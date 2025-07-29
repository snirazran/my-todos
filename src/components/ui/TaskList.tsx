'use client';

import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

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
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void; // <- same signature as before
  showConfetti: boolean;
  renderBullet?: (task: Task) => React.ReactNode;
}) {
  return (
    <>
      <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
        <h2 className="mb-6 text-2xl font-bold">המשימות שלך היום:</h2>
        <div className="space-y-2">
          {tasks.map((task, i) => (
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
                <div className="flex-shrink-0">
                  {renderBullet ? (
                    renderBullet(task)
                  ) : task.completed ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(task.id, false);
                        {
                          /* explicit un‑complete */
                        }
                      }}
                    >
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(task.id, true);
                        {
                          /* explicit complete */
                        }
                      }}
                    >
                      <Circle className="w-6 h-6 text-slate-400" />
                    </button>
                  )}
                </div>

                <span
                  className={`text-lg ${
                    task.completed ? 'line-through text-slate-400' : ''
                  }`}
                >
                  {task.text}
                </span>
              </div>
            </div>
          ))}
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
