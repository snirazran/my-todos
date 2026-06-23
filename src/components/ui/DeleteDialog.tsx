'use client';

import { EyeOff, Trash2, Repeat } from 'lucide-react';
import React from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';

type Variant = 'regular' | 'weekly' | 'backlog';

interface Props {
  open: boolean;
  variant: Variant;
  itemLabel?: string;
  dayLabel?: string;
  repeatMode?:
    | 'none'
    | 'daily'
    | 'weekdays'
    | 'weekend'
    | 'weekly'
    | 'monthly'
    | 'custom';
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
  repeatMode,
  busy,
  onClose,
  onDeleteToday,
  onDeleteAll,
}: Props) {
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

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={10000}
      backdropClassName="bg-slate-950/70 backdrop-blur-sm"
      className="bg-white/95 dark:bg-slate-900/90 sm:max-w-[440px]"
    >
      {() => (
      <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1 sm:pb-5 sm:pt-5">
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
              ? repeatMode === 'daily' ||
                repeatMode === 'weekdays' ||
                repeatMode === 'weekend'
                ? 'Delete all repeats'
                : 'Stop repeating'
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
      )}
    </BaseSheet>
  );
}
