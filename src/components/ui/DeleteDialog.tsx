'use client';

import { X, EyeOff, Trash2, Repeat, CalendarDays } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';

type Variant = 'regular' | 'weekly' | 'backlog' | 'habit';

interface Props {
  open: boolean;
  variant: Variant;
  itemLabel?: string;
  dayLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onDeleteToday?: () => void;
  onDeleteAll?: () => void;
  onEditDays?: () => void;
}

export function DeleteDialog({
  open,
  variant,
  itemLabel,
  dayLabel = 'today',
  busy,
  onClose,
  onDeleteToday,
  onDeleteAll,
  onEditDays,
}: Props) {
  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const typeLabel =
    variant === 'weekly' ? 'Repeating task'
    : variant === 'habit' ? 'Habit'
    : variant === 'backlog' ? 'Backlog item'
    : 'Task';

  const dialogContent = (
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
              {typeLabel}
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              {itemLabel ? `"${itemLabel}"` : 'What would you like to do?'}
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

        {/* Options */}
        <div className="px-4 pb-4 space-y-2">

          {/* ── HABIT ── */}
          {variant === 'habit' && (
            <>
              {/* Skip today */}
              <button
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left disabled:opacity-50 border border-slate-200/60 dark:border-slate-700/50 active:scale-[0.98]"
                onClick={onDeleteToday}
                disabled={busy}
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <EyeOff className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Skip {dayLabel}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Won&apos;t show {dayLabel} — still repeats as usual
                  </p>
                </div>
              </button>

              {/* Edit days */}
              {onEditDays && (
                <button
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left disabled:opacity-50 border border-slate-200/60 dark:border-slate-700/50 active:scale-[0.98]"
                  onClick={onEditDays}
                  disabled={busy}
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Edit days</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Change which days this habit repeats
                    </p>
                  </div>
                </button>
              )}

              {/* Delete habit */}
              <button
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all text-left disabled:opacity-50 border border-rose-200/60 dark:border-rose-800/40 active:scale-[0.98]"
                onClick={onDeleteAll}
                disabled={busy}
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Delete habit</p>
                  <p className="text-xs text-rose-500/80 dark:text-rose-400/70 mt-0.5">
                    Removes it from all days permanently
                  </p>
                </div>
              </button>
            </>
          )}

          {/* ── WEEKLY ── */}
          {variant === 'weekly' && (
            <>
              <button
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left disabled:opacity-50 border border-slate-200/60 dark:border-slate-700/50 active:scale-[0.98]"
                onClick={onDeleteToday}
                disabled={busy}
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <EyeOff className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Skip {dayLabel}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Hides it this week — still repeats next {dayLabel}
                  </p>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all text-left disabled:opacity-50 border border-rose-200/60 dark:border-rose-800/40 active:scale-[0.98]"
                onClick={onDeleteAll}
                disabled={busy}
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Repeat className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Stop repeating</p>
                  <p className="text-xs text-rose-500/80 dark:text-rose-400/70 mt-0.5">
                    Deletes it from all weeks permanently
                  </p>
                </div>
              </button>
            </>
          )}

          {/* ── REGULAR / BACKLOG ── */}
          {(variant === 'regular' || variant === 'backlog') && (
            <button
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all text-left disabled:opacity-50 border border-rose-200/60 dark:border-rose-800/40 active:scale-[0.98]"
              onClick={onDeleteToday ?? onDeleteAll}
              disabled={busy}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                  {variant === 'backlog' ? 'Remove from backlog' : `Delete from ${dayLabel}`}
                </p>
                <p className="text-xs text-rose-500/80 dark:text-rose-400/70 mt-0.5">
                  {variant === 'backlog' ? 'You can re-add it anytime' : 'This cannot be undone'}
                </p>
              </div>
            </button>
          )}

          {/* Cancel */}
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

  return createPortal(dialogContent, document.body);
}
