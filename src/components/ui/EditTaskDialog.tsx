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
}

export function EditTaskDialog({
  open,
  initialText,
  busy,
  onClose,
  onSave,
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
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4"
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
          <div className="mt-1 h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
            <Pencil className="w-4 h-4" />
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              Edit Task
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
               make changes to your task below.
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

        <div className="mt-5 space-y-4">
             <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') onClose();
                }}
                className="w-full px-3 py-2 text-lg bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors"
                placeholder="Task description..."
                disabled={busy}
             />

             <div className="flex justify-end gap-2 pt-2">
                 <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    disabled={busy}
                 >
                     Cancel
                 </button>
                 <button
                    onClick={handleSave}
                    disabled={busy || !text.trim()}
                    className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
                 >
                     {busy ? 'Saving...' : 'Save Changes'}
                 </button>
             </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
