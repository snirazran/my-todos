'use client';

import * as React from 'react';

type BacklogItem = { id: string; text: string };

export default function BacklogPanel({
  weeklyBacklog,
  weeklyTemplateBacklog,
  dateStr, // yyyy-MM-dd (today)
  onRefreshToday,
  onRefreshBacklog,
}: {
  weeklyBacklog: BacklogItem[]; // “This week only”
  weeklyTemplateBacklog: BacklogItem[]; // “Every week (no day)”
  dateStr: string;
  onRefreshToday: () => Promise<void> | void;
  onRefreshBacklog: () => Promise<void> | void;
}) {
  const addTodayFromThisWeek = async (item: BacklogItem) => {
    const dow = new Date().getDay();
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        days: [dow],
        repeat: 'this-week',
      }),
    });
    await fetch('/api/weekly-backlog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: item.id }),
    });
    await onRefreshToday();
    await onRefreshBacklog();
  };

  const addTodayFromTemplate = async (item: BacklogItem) => {
    const dow = new Date().getDay();
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        days: [dow],
        repeat: 'this-week',
      }),
    });
    await onRefreshToday();
  };

  const removeFromTemplate = async (taskId: string) => {
    await fetch('/api/manage-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: -1, taskId }),
    });
    await onRefreshBacklog();
  };

  const removeFromThisWeek = async (taskId: string) => {
    await fetch('/api/weekly-backlog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    await onRefreshBacklog();
  };

  if (weeklyBacklog.length === 0 && weeklyTemplateBacklog.length === 0)
    return null;

  return (
    <div className="p-4 mt-6 border border-dashed rounded-2xl border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40">
      <h3 className="mb-2 text-lg font-semibold">משימות ללא יום:</h3>

      <div className="grid gap-4 md:grid-cols-2">
        {/* This week only */}
        {weeklyBacklog.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-500">השבוע בלבד</p>
            <ul className="space-y-2">
              {weeklyBacklog.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 bg-white rounded-lg dark:bg-slate-800"
                >
                  <span>{t.text}</span>
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 text-sm text-white rounded-md bg-emerald-600"
                      onClick={() => addTodayFromThisWeek(t)}
                    >
                      עשו היום
                    </button>
                    <button
                      className="px-2 py-1 text-sm rounded-md bg-slate-200 dark:bg-slate-600"
                      onClick={() => removeFromThisWeek(t.id)}
                    >
                      הסר
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Weekly template backlog */}
        {weeklyTemplateBacklog.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-500">כל שבוע</p>
            <ul className="space-y-2">
              {weeklyTemplateBacklog.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 bg-white rounded-lg dark:bg-slate-800"
                >
                  <span>{t.text}</span>
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 text-sm text-white rounded-md bg-emerald-600"
                      onClick={() => addTodayFromTemplate(t)}
                    >
                      עשו היום
                    </button>
                    <button
                      className="px-2 py-1 text-sm rounded-md bg-slate-200 dark:bg-slate-600"
                      title="Remove from weekly template"
                      onClick={() => removeFromTemplate(t.id)}
                    >
                      הסר
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
