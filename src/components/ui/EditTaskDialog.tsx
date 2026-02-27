'use client';

import { X, Pencil } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  initialText: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (newText: string) => void;
  title?: string;
  subtitle?: string;
}

export function EditTaskDialog({
  open,
  initialText,
  busy,
  onClose,
  onSave,
  title = 'Edit Task',
  subtitle = 'Make changes to your task below.',
}: Props) {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText(initialText);
      // specific request for focus
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialText]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const handleSave = () => {
    if (text.trim()) {
      onSave(text.trim());
    }
  };

  const dialogContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0"
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
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              {title.includes('Habit') ? 'Habit' : 'Task'}
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              {title}
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

        <div className="px-5 pb-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {subtitle}
          </p>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') onClose();
              }}
              maxLength={45}
              className="w-full h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-none ring-0 focus:ring-2 focus:ring-primary/50 text-sm font-medium placeholder:text-slate-400 transition-all"
              placeholder="Description..."
              disabled={busy}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none">
              <span
                className={
                  text.length >= 40
                    ? 'text-rose-500'
                    : 'text-slate-400 dark:text-slate-500'
                }
              >
                {text.length}/45
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
          <button
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm"
            onClick={handleSave}
            disabled={busy || !text.trim()}
          >
            {busy ? 'Saving...' : 'Save changes'}
          </button>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
