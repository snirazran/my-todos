'use client';

import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';

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
      ? 'Remove weekly task?'
      : variant === 'backlog'
      ? 'Remove from backlog?'
      : 'Delete task?';

  const desc =
    variant === 'weekly'
      ? 'Choose how you want to remove it.'
      : variant === 'backlog'
      ? 'This will disappear from your backlog.'
      : 'This removes it from today.';

  if (typeof document === 'undefined') return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white/90 dark:bg-slate-900/85 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)] border border-slate-200/80 dark:border-slate-800/70 backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-8 flex items-center justify-center rounded-full bg-rose-100 text-rose-700 font-semibold dark:bg-rose-900/40 dark:text-rose-200">
            !
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              {title}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {itemLabel ? `"${itemLabel}" - ` : ''}
              {desc}
            </p>
          </div>
          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300/70"
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
                className="flex w-full items-center justify-between rounded-lg bg-white/80 px-4 py-3 text-left text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800/80 dark:text-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-200/70 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                onClick={onDeleteToday}
                disabled={busy}
              >
                <span className="font-medium">Hide just today</span>
                <span className="text-xs text-slate-500">Keeps weekly repeats</span>
              </button>
              <button
                className="flex w-full items-center justify-between rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 text-left text-white hover:brightness-110 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-rose-200/70 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                onClick={onDeleteAll}
                disabled={busy}
              >
                <span className="font-semibold">Delete all repeats</span>
                <span className="text-xs text-rose-100">Today and future</span>
              </button>
            </>
          ) : (
            <button
              className="flex w-full items-center justify-between rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 text-left text-white hover:brightness-110 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-rose-200/70 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
              onClick={onDeleteToday ?? onDeleteAll}
              disabled={busy}
            >
              <span className="font-semibold">
                {variant === 'backlog' ? 'Remove from backlog' : 'Delete for today'}
              </span>
              <span className="text-xs text-rose-100">This cannot be undone</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
