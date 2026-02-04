'use client';

import { Lock, X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PremiumLimitDialog({
  open,
  onClose,
}: Props) {
  if (!open) return null;

  if (typeof document === 'undefined') return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4"
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
        className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white/90 dark:bg-slate-900/85 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)] border border-slate-200/80 dark:border-slate-800/70 backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-8 flex items-center justify-center rounded-full bg-amber-100 text-amber-600 font-semibold dark:bg-amber-900/40 dark:text-amber-200">
            <Lock className="w-4 h-4" />
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              Limit Reached
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Unlock unlimited tags with <b>Premium</b> or delete unused ones to make space.
            </p>
          </div>
          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6">
           <button
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-white font-bold text-[15px] shadow-sm hover:brightness-110 active:scale-[0.98] transition-all"
              onClick={onClose}
            >
              Okay
            </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
