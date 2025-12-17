'use client';

import * as React from 'react';
import { EllipsisVertical, CalendarClock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
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

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  // Listen for other menus opening to auto-close this one (syncs with TaskList)
  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenuFor((curr) => (curr && curr !== id ? null : curr));
    };
    window.addEventListener('task-menu-open', closeIfOther as EventListener);
    return () =>
      window.removeEventListener(
        'task-menu-open',
        closeIfOther as EventListener
      );
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

  return (
    <div
      dir="ltr"
      // Added overflow-visible to allow menus to spill out if needed
      className="px-6 pt-6 pb-4 overflow-visible rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="flex items-center gap-3 text-xl font-black tracking-tight uppercase text-slate-800 dark:text-slate-100">
          <CalendarClock className="w-6 h-6 text-purple-500 md:w-7 md:h-7" />
          Saved Tasks
        </h3>
        {later.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 px-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {later.length}
          </span>
        )}
      </div>

      <div className="pb-2 space-y-3 overflow-visible min-h-[100px]">
        {later.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed text-slate-400 border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 rounded-xl">
            <CalendarClock className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No tasks saved yet.</p>
            <p className="mt-1 text-xs opacity-60">
              When you&apos;re unsure about the "when", save tasks here. You can
              add them to your day whenever you&apos;re ready!
            </p>
          </div>
        ) : (
          later.map((t, i) => {
            const isMenuOpen = menuFor === t.id;

            return (
              <div
                key={t.id}
                // IMPORTANT: Z-Index logic fixes the clipping/overlap issue
                className={`group relative transition-all duration-200 ${
                  isMenuOpen ? 'z-50' : 'z-auto'
                }`}
                style={{
                  // Ensure active menu item floats above subsequent items
                  zIndex: isMenuOpen ? 50 : 1,
                }}
              >
                {/* Row */}
                <div
                  className={`
                    relative flex items-center gap-4 px-3 py-3.5 
                    transition-all duration-200 rounded-xl 
                    border border-transparent hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm
                    ${isMenuOpen ? 'bg-white dark:bg-slate-800 shadow-md' : ''}
                  `}
                  style={{
                    animation: `fadeInUp 0.4s ease-out ${i * 0.05}s forwards`,
                    opacity: 0,
                  }}
                >
                  {/* Fly Icon */}
                  <div className="flex items-center justify-center flex-shrink-0 w-7 h-7">
                    <Fly
                      size={24}
                      className="text-purple-600 transition-all opacity-70 grayscale group-hover:grayscale-0 group-hover:opacity-100"
                    />
                  </div>

                  {/* Text */}
                  <span className="flex-1 text-base font-medium md:text-lg text-slate-700 dark:text-slate-200">
                    {t.text}
                  </span>

                  {/* Actions */}
                  <div className="relative flex items-center gap-2 shrink-0">
                    {/* "Do Today!" Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToday(t);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all rounded-lg shadow-sm shadow-indigo-500/20"
                    >
                      Do Today!
                    </button>

                    {/* Menu Button */}
                    <button
                      className={`
                        p-2 rounded-lg transition-colors
                        ${
                          isMenuOpen
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }
                      `}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Dispatch event to close other menus
                        window.dispatchEvent(
                          new CustomEvent('task-menu-open', {
                            detail: { id: `backlog:${t.id}` },
                          })
                        );
                        setMenuFor((prev) => (prev === t.id ? null : t.id));
                      }}
                    >
                      <EllipsisVertical className="w-5 h-5" />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {isMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.1 }}
                          className="absolute right-0 top-full mt-2 z-[100] w-48 rounded-xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-700/70 dark:bg-slate-900 overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-1">
                            <button
                              className="flex items-center justify-start w-full gap-2 px-3 py-2 text-sm font-medium text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => {
                                setMenuFor(null);
                                setConfirmId(t);
                              }}
                            >
                              Delete Task
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            );
          })
        )}
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

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
