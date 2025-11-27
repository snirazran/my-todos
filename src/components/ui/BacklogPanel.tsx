'use client';

import * as React from 'react';
import { EllipsisVertical } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { DeleteDialog } from '@/components/ui/DeleteDialog';

type BacklogItem = { id: string; text: string };

export default function BacklogPanel({
  later,
  onRefreshToday,
  onRefreshBacklog,
}: {
  later: BacklogItem[];
  onRefreshToday: () => Promise<void> | void;
  onRefreshBacklog: () => Promise<void> | void;
}) {
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<BacklogItem | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenuFor((curr) => (curr && curr !== id ? null : curr));
    };
    window.addEventListener('task-menu-open', closeIfOther as EventListener);
    return () =>
      window.removeEventListener('task-menu-open', closeIfOther as EventListener);
  }, []);

  const addToday = async (item: BacklogItem) => {
    const dow = new Date().getDay();

    await fetch('/api/tasks?view=board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        days: [dow],
        repeat: 'this-week',
      }),
    });

    await fetch('/api/tasks?view=board', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: -1, taskId: item.id }),
    });

    await onRefreshToday();
    await onRefreshBacklog();
  };

  const removeLater = async (taskId: string) => {
    setBusy(true);
    try {
      await fetch('/api/tasks?view=board', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: -1, taskId }),
      });
      await onRefreshBacklog();
    } finally {
      setBusy(false);
    }
  };

  if (later.length === 0) return null;

  return (
    <>
      <div className="p-4 mt-6 border border-dashed rounded-2xl border-slate-300/80 dark:border-slate-700/70 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:bg-slate-900/70">
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
          Later this week
        </h3>

        <ul className="space-y-3">
          {later.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/90 p-4 ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.12)] dark:bg-slate-900/70 dark:ring-slate-800/70"
            >
              <div className="flex items-center gap-3">
                <Fly size={28} y={-4} x={-2} />
                <span className="text-lg font-medium text-slate-900 dark:text-slate-100">
                  {t.text}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,.28)] hover:brightness-110"
                  onClick={() => addToday(t)}
                  title="Add to today (one-time)"
                >
                  Do today
                </button>
                <div className="relative">
                  <button
                    className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('task-menu-open', {
                          detail: { id: `backlog:${t.id}` },
                        })
                      );
                      setMenuFor((prev) => (prev === t.id ? null : t.id));
                    }}
                    title="More actions"
                    aria-label="More actions"
                  >
                    <EllipsisVertical className="w-5 h-5 text-slate-500" />
                  </button>
                  {menuFor === t.id && (
                    <div
                      className="absolute left-1/2 top-11 z-20 w-40 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white/95 shadow-lg backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/90"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex w-full items-center justify-center px-3 py-2 text-sm font-medium text-slate-800 rounded-xl hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/70"
                        onClick={() => {
                          setMenuFor(null);
                          setConfirmId(t);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {confirmId && (
        <DeleteDialog
          open={!!confirmId}
          variant="backlog"
          itemLabel={confirmId.text}
          busy={busy}
          onClose={() => {
            if (!busy) setConfirmId(null);
          }}
          onDeleteAll={() => {
            if (!confirmId) return;
            removeLater(confirmId.id).then(() => setConfirmId(null));
          }}
        />
      )}
    </>
  );
}
