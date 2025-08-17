// src/components/dialog/AddTaskModal.tsx
'use client';

import { useState } from 'react';

const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const UNSCHEDULED_LABEL = 'ללא יום (השבוע)';

export type RepeatMode = 'weekly' | 'this-week';

export default function AddTaskModal({
  initialText = '',
  onClose,
  onSave,
  allowMultipleDays = true,
  defaultRepeat = 'this-week',
}: {
  initialText?: string;
  onClose: () => void;
  onSave: (data: {
    text: string;
    days: number[];
    repeat: RepeatMode;
  }) => Promise<void> | void;
  allowMultipleDays?: boolean;
  defaultRepeat?: RepeatMode;
}) {
  const [text, setText] = useState(initialText);
  const [days, setDays] = useState<number[]>([]);
  const [repeat, setRepeat] = useState<RepeatMode>(defaultRepeat);

  const toggleDay = (d: number) =>
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : allowMultipleDays
        ? [...prev, d]
        : [d]
    );

  const canSave = text.trim().length > 0 && days.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="p-6 bg-white shadow-lg w-[420px] dark:bg-slate-800 rounded-2xl">
        <h3 className="mb-4 text-xl font-bold text-center text-slate-900 dark:text-white">
          הוסף משימה
        </h3>

        <input
          autoFocus
          placeholder="שם משימה"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-2 mb-4 text-base border rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-violet-500"
        />

        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          בחר יום/ימים:
        </p>
        <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
          {hebrewDays.map((d, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`px-2 py-1 rounded-lg font-medium ${
                days.includes(i)
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
              }`}
            >
              {d}
            </button>
          ))}
          {/* index 7 in UI maps to -1 in backend */}
          <button
            onClick={() => toggleDay(7)}
            className={`px-2 py-1 rounded-lg font-medium ${
              days.includes(7)
                ? 'bg-violet-600 text-white'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
            }`}
          >
            {UNSCHEDULED_LABEL}
          </button>
        </div>

        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          חזרה:
        </p>
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setRepeat('this-week')}
            className={`px-3 py-1 rounded-lg ${
              repeat === 'this-week'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
            }`}
          >
            השבוע בלבד
          </button>
          <button
            onClick={() => setRepeat('weekly')}
            className={`px-3 py-1 rounded-lg ${
              repeat === 'weekly'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
            }`}
          >
            כל שבוע
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-base rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            ביטול
          </button>
          <button
            disabled={!canSave}
            onClick={async () => {
              await onSave({ text: text.trim(), days, repeat });
              onClose();
            }}
            className="px-4 py-2 text-base font-medium text-white rounded-lg bg-violet-600 disabled:opacity-50 hover:bg-violet-700"
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}
