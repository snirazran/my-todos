// components/ui/BacklogPanel.tsx
'use client';

import * as React from 'react';

type BacklogItem = { id: string; text: string };

export default function BacklogPanel({
  later,
  onRefreshToday,
  onRefreshBacklog,
}: {
  later: BacklogItem[]; // only the "Later this week" items
  onRefreshToday: () => Promise<void> | void;
  onRefreshBacklog: () => Promise<void> | void;
}) {
  const addToday = async (item: BacklogItem) => {
    const dow = new Date().getDay(); // 0..6 (Sun..Sat)

    // 1) create a one-time task for *today* (this week)
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        days: [dow],
        repeat: 'this-week',
      }),
    });

    // 2) remove it from "Later this week"
    await fetch('/api/manage-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: -1, taskId: item.id }),
    });

    await onRefreshToday();
    await onRefreshBacklog();
  };

  const removeLater = async (taskId: string) => {
    await fetch('/api/manage-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: -1, taskId }),
    });
    await onRefreshBacklog();
  };

  if (later.length === 0) return null;

  return (
    <div className="p-4 mt-6 border border-dashed rounded-2xl border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40">
      <h3 className="mb-3 text-lg font-semibold">Later this week</h3>

      <ul className="space-y-2">
        {later.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between px-3 py-2 bg-white rounded-lg dark:bg-slate-800"
          >
            <span>{t.text}</span>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 text-sm text-white rounded-md bg-emerald-600"
                onClick={() => addToday(t)}
                title="Add to today (one-time)"
              >
                Do today
              </button>
              <button
                className="px-2 py-1 text-sm rounded-md bg-slate-200 dark:bg-slate-600"
                onClick={() => removeLater(t.id)}
                title="Remove from Later this week"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
