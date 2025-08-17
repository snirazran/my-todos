'use client';

import { CheckCircle2, Circle, Plus, X, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';

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
  visuallyCompleted,
  onAddRequested,
  weeklyIds = new Set<string>(),
  onDeleteToday,
  onDeleteFromWeek,
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode;
  visuallyCompleted?: Set<string>;
  onAddRequested: (
    prefill: string,
    insertAfterIndex: number | null,
    opts?: { preselectToday?: boolean }
  ) => void;

  /** IDs that belong to the weekly template for *today* */
  weeklyIds?: Set<string>;
  /** remove from *today only* */
  onDeleteToday: (taskId: string) => Promise<void> | void;
  /** remove from the weekly template (and today/future days) */
  onDeleteFromWeek: (taskId: string) => Promise<void> | void;
}) {
  const vSet = visuallyCompleted ?? new Set<string>();

  // bottom composer
  const [inlineOpen, setInlineOpen] = useState(false);
  const [draft, setDraft] = useState('');

  // hover state for separators (desktop only)
  const [hoverSep, setHoverSep] = useState<number | null>(null);

  // inline composer between rows
  const [openGap, setOpenGap] = useState<number | null>(null);
  const [gapDrafts, setGapDrafts] = useState<Record<number, string>>({});

  // delete modal
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const openInline = () => setInlineOpen(true);
  const closeInline = () => {
    setDraft('');
    setInlineOpen(false);
  };
  const fireAddBottom = () => {
    if (!draft.trim()) return;
    onAddRequested(draft.trim(), null, { preselectToday: true });
    closeInline();
  };

  const isWeekly = (t: Task) => weeklyIds.has(t.id);

  const confirmDeleteToday = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await onDeleteToday(toDelete.id);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWeek = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await onDeleteFromWeek(toDelete.id);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
        <h2 className="mb-6 text-2xl font-bold">המשימות שלך היום:</h2>

        <div className="space-y-0">
          {tasks.map((task, i) => {
            const isDone = task.completed || vSet.has(task.id);

            return (
              <div key={task.id} className="group">
                {/* Row */}
                <div
                  onClick={() => toggle(task.id)}
                  className="p-4 transition-colors duration-200 cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
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
                      className="flex-1 text-lg"
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

                    {/* delete button (shows on hover on desktop, always visible on touch) */}
                    <button
                      className="p-2 transition-opacity rounded-md opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-600"
                      title="מחק משימה"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(task);
                      }}
                    >
                      <Trash2 className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* between i and i+1 (desktop only) */}
                {i < tasks.length - 1 && (
                  <>
                    {openGap === i ? (
                      <GapComposer
                        index={i}
                        value={gapDrafts[i] ?? ''}
                        onChange={(txt) =>
                          setGapDrafts((m) => ({ ...m, [i]: txt }))
                        }
                        onConfirm={() => {
                          const txt = (gapDrafts[i] ?? '').trim();
                          if (!txt) return;
                          onAddRequested(txt, i, { preselectToday: true });
                          setOpenGap(null);
                        }}
                        onCancel={() => setOpenGap(null)}
                      />
                    ) : (
                      <SeparatorHover
                        index={i}
                        hoverSep={hoverSep}
                        setHoverSep={setHoverSep}
                        onOpen={() => {
                          setHoverSep(null);
                          setOpenGap(i);
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Bottom “Add task” */}
          {!inlineOpen ? (
            <button
              onClick={openInline}
              className="flex items-center justify-center w-full gap-2 px-4 py-3 mt-2 text-violet-700 bg-violet-50/70 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 rounded-xl"
            >
              <Plus className="w-5 h-5" /> הוסף משימה
            </button>
          ) : (
            <div className="px-4 py-3 mt-2 bg-slate-50 dark:bg-slate-700 rounded-xl">
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="משימה חדשה…"
                  className="flex-1 px-3 py-2 bg-white border rounded-md dark:bg-slate-800 border-slate-200 dark:border-slate-600"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fireAddBottom();
                    if (e.key === 'Escape') closeInline();
                  }}
                />
                <button
                  onClick={fireAddBottom}
                  className="px-3 py-2 text-white rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
                  disabled={!draft.trim()}
                >
                  הוסף
                </button>
                <button
                  onClick={closeInline}
                  className="px-3 py-2 rounded-md bg-slate-200 dark:bg-slate-600"
                  title="ביטול"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 כל הכבוד! 🎉</h3>
          <p className="text-lg">השלמת את כל המשימות להיום!</p>
        </div>
      )}

      {/* delete modal */}
      <AnimatePresence>
        {toDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setToDelete(null);
            }}
          >
            <div
              className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="mb-1 text-lg font-semibold">
                    {isWeekly(toDelete)
                      ? 'מחיקת משימה שבועית'
                      : 'מחיקת משימה להיום'}
                  </h4>
                  <p className="mb-4 text-slate-600 dark:text-slate-300">
                    {isWeekly(toDelete)
                      ? 'האם למחוק רק מהיום או להסיר מהשבוע כולו?'
                      : 'האם למחוק את המשימה מהיום? הפעולה קבועה.'}
                  </p>
                </div>
                <button
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setToDelete(null)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600"
                  onClick={() => setToDelete(null)}
                  disabled={busy}
                >
                  בטל
                </button>

                {isWeekly(toDelete) ? (
                  <>
                    <button
                      className="px-4 py-2 text-white rounded-lg bg-rose-600 disabled:opacity-60"
                      onClick={confirmDeleteToday}
                      disabled={busy}
                      title="Remove only from today's list"
                    >
                      מחיקה מהיום בלבד
                    </button>
                    <button
                      className="px-4 py-2 text-white rounded-lg bg-rose-700 disabled:opacity-60"
                      onClick={confirmDeleteWeek}
                      disabled={busy}
                      title="Remove from weekly template and upcoming days"
                    >
                      מחיקה מהשבוע
                    </button>
                  </>
                ) : (
                  <button
                    className="px-4 py-2 text-white rounded-lg bg-rose-600 disabled:opacity-60"
                    onClick={confirmDeleteToday}
                    disabled={busy}
                  >
                    מחק
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────── */
/*  Subtle Trello-style hover rails + “+”        */
/* ────────────────────────────────────────────── */
function SeparatorHover({
  index,
  hoverSep,
  setHoverSep,
  onOpen,
}: {
  index: number;
  hoverSep: number | null;
  setHoverSep: React.Dispatch<React.SetStateAction<number | null>>;
  onOpen: () => void;
}) {
  return (
    <div
      className="relative h-1.5 md:h-5 select-none"
      onMouseEnter={() => setHoverSep(index)}
      onMouseLeave={() => setHoverSep(null)}
    >
      <AnimatePresence>
        {hoverSep === index && (
          <motion.div
            className="absolute inset-0 z-10 items-center justify-center hidden pointer-events-none md:flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Rail />
            <motion.button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="pointer-events-auto mx-3 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 shadow-sm ring-1 ring-violet-200/70 dark:ring-violet-900/40 flex items-center justify-center text-violet-700 dark:text-violet-300"
              title="הוסף משימה כאן"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              whileHover={{ scale: 1.03 }}
            >
              <Plus className="w-5 h-5" />
            </motion.button>
            <Rail />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rail() {
  return (
    <div className="flex-1 h-[2px] overflow-hidden">
      <motion.div
        className="h-full text-violet-400 dark:text-violet-300"
        initial={{ width: '60%', opacity: 0.7 }}
        animate={{ width: '100%', opacity: 1 }}
        exit={{ width: '60%', opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 0 12px, transparent 12px 22px)',
          backgroundSize: '22px 2px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'center',
        }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────── */
/*  Inline composer (animated gap)               */
/*  Closes on outside click; keeps draft         */
/* ────────────────────────────────────────────── */
function GapComposer({
  index,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', onDocDown, { passive: true });
    return () => document.removeEventListener('mousedown', onDocDown as any);
  }, [onCancel]);

  useEffect(() => {
    // focus input when it opens
    const el = ref.current?.querySelector('input') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, []);

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={`gap-${index}`}
        ref={ref}
        className="relative my-0.5"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        layout
      >
        <div className="flex items-center gap-2 px-3 py-2 shadow-sm bg-slate-50 dark:bg-slate-700 rounded-xl">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="שם משימה…"
            className="flex-1 px-3 py-2 bg-white border rounded-md dark:bg-slate-800 border-slate-200 dark:border-slate-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <button
            onClick={onConfirm}
            className="px-3 py-2 text-white rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
            disabled={!value.trim()}
          >
            הוסף
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-md bg-slate-200 dark:bg-slate-600"
            title="ביטול"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
