'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

interface Props {
  open: boolean;
  taskId: string;
  taskLabel?: string;
  initialGoal: number;
  busy?: boolean;
  onClose: () => void;
  onSave: (newGoal: number) => void;
}

export function EditHabitDaysDialog({
  open,
  taskId,
  taskLabel,
  initialGoal,
  busy,
  onClose,
  onSave,
}: Props) {
  const [goal, setGoal] = useState<number>(initialGoal);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const content = (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Habit Goal
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              {taskLabel ? `"${taskLabel}"` : 'Edit habit goal'}
            </h4>
          </div>
          <button
            className="flex-shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Goal picker */}
        <div className="px-5 pb-2">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-1">
            Goal: {goal} {goal === 1 ? 'time' : 'times'} per week
          </p>
          <div className="flex justify-start gap-2 py-2 px-1 overflow-x-auto no-scrollbar">
            {[1, 2, 3, 4, 5, 6, 7].map((num) => {
              const isOn = goal >= num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setGoal(num)}
                  className={`
                    w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black transition-all border shadow-sm
                    ${
                      isOn
                        ? 'bg-primary/20 border-primary text-primary scale-110 shadow-md shadow-primary/10'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-4 flex flex-col gap-2">
          <button
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm"
            onClick={() => onSave(goal)}
            disabled={busy}
          >
            Save changes
          </button>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
