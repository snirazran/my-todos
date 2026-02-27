'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

// API days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first display order

interface Props {
  open: boolean;
  taskId: string;
  taskLabel?: string;
  initialDays: number[];
  busy?: boolean;
  onClose: () => void;
  onSave: (newDays: number[]) => void;
}

export function EditHabitDaysDialog({
  open,
  taskId,
  taskLabel,
  initialDays,
  busy,
  onClose,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<number[]>(initialDays);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const toggle = (day: number) => {
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

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
              Habit
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              {taskLabel ? `"${taskLabel}"` : 'Edit repeat days'}
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

        {/* Day picker */}
        <div className="px-5 pb-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Choose which days this habit appears
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_ORDER.map((apiDay) => {
              const isOn = selected.includes(apiDay);
              return (
                <button
                  key={apiDay}
                  onClick={() => toggle(apiDay)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                    isOn
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {DAY_LABELS[apiDay]}
                  {isOn && <Check className="w-3 h-3" strokeWidth={3} />}
                  {!isOn && <span className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
          <button
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm"
            onClick={() => onSave(selected)}
            disabled={busy || selected.length === 0}
          >
            {selected.length === 0 ? 'Pick at least one day' : 'Save changes'}
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
