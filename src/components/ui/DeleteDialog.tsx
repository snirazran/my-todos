'use client';

import { X } from 'lucide-react';
import React from 'react';

type Variant = 'regular' | 'weekly' | 'backlog';

interface Props {
  open: boolean;
  variant: Variant;
  itemLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onDeleteToday?: () => void;
  onDeleteAll?: () => void;
}

export function DeleteDialog({
  open,
  variant,
  itemLabel,
  busy,
  onClose,
  onDeleteToday,
  onDeleteAll,
}: Props) {
  if (!open) return null;

  const title =
    variant === 'weekly'
      ? 'Delete weekly task'
      : variant === 'backlog'
      ? 'Remove backlog task'
      : 'Delete task';

  const desc =
    variant === 'weekly'
      ? 'Remove just for today or delete this weekly task everywhere.'
      : variant === 'backlog'
      ? 'Remove this item from your backlog.'
      : 'Delete this task from today.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-5 shadow-lg dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              {title}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {itemLabel ? `"${itemLabel}" · ` : ''}
              {desc}
            </p>
          </div>
          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {variant === 'weekly' ? (
            <>
              <button
                className="flex w-full items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-left text-slate-800 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-700 dark:text-slate-50 dark:hover:bg-slate-600"
                onClick={onDeleteToday}
                disabled={busy}
              >
                <span>Remove today only</span>
                <span className="text-xs text-slate-500">
                  Keeps weekly repeats
                </span>
              </button>
              <button
                className="flex w-full items-center justify-between rounded-lg bg-rose-600 px-4 py-3 text-left text-white hover:bg-rose-700 disabled:opacity-60"
                onClick={onDeleteAll}
                disabled={busy}
              >
                <span>Delete everywhere</span>
                <span className="text-xs text-rose-100">
                  Future repeats included
                </span>
              </button>
            </>
          ) : (
            <button
              className="flex w-full items-center justify-between rounded-lg bg-rose-600 px-4 py-3 text-left text-white hover:bg-rose-700 disabled:opacity-60"
              onClick={onDeleteToday ?? onDeleteAll}
              disabled={busy}
            >
              <span>
                {variant === 'backlog' ? 'Remove from backlog' : 'Delete task'}
              </span>
              <span className="text-xs text-rose-100">Permanent</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
