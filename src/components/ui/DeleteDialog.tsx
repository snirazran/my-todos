'use client';

import { X, EyeOff, Trash2, Repeat } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';

type Variant = 'regular' | 'weekly' | 'backlog';

interface Props {
  open: boolean;
  variant: Variant;
  itemLabel?: string;
  dayLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onDeleteToday?: () => void;
  onDeleteAll?: () => void;
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
}: Props) {
  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const title =
    variant === 'weekly'
      ? 'Delete repeating task?'
      : variant === 'backlog'
        ? 'Remove from backlog?'
        : 'Delete task?';

  const description = itemLabel ? (
    <>
      <span className="font-semibold text-slate-700 dark:text-slate-200">
        &ldquo;{itemLabel}&rdquo;
      </span>{' '}
      {variant === 'weekly'
        ? 'is a repeating task. Choose how to remove it.'
        : variant === 'backlog'
          ? 'will be removed from your backlog. You can re-add it anytime.'
          : `will be deleted from ${dayLabel}. This cannot be undone.`}
    </>
  ) : (
    'What would you like to do?'
  );

  const dialogContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[440px] max-w-full rounded-2xl bg-white/95 dark:bg-slate-900/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)] border border-slate-200/80 dark:border-slate-800/70 backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
            <Trash2 className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white leading-snug">
              {title}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {description}
            </p>
          </div>
          <button
            className="flex-shrink-0 p-2 -mr-1 -mt-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300/70"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 space-y-2.5">
          {variant === 'weekly' && (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 py-3 text-[15px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-50"
              onClick={onDeleteToday}
              disabled={busy}
            >
              <EyeOff className="w-4 h-4" />
              Skip {dayLabel}
            </button>
          )}

          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 py-3 text-[15px] font-bold text-white shadow-sm shadow-red-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
            onClick={
              variant === 'weekly' ? onDeleteAll : (onDeleteToday ?? onDeleteAll)
            }
            disabled={busy}
          >
            {variant === 'weekly' ? (
              <Repeat className="w-4 h-4" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {variant === 'weekly'
              ? 'Stop repeating'
              : variant === 'backlog'
                ? 'Remove from backlog'
                : `Delete from ${dayLabel}`}
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

  return createPortal(dialogContent, document.body);
}
