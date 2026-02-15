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
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px] px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[440px] max-w-[calc(100vw-2rem)] rounded-[28px] bg-popover/95 backdrop-blur-2xl p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)] ring-1 ring-border/80"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="mt-1 h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
            <Pencil className="w-4 h-4" />
          </div>
          <div className="flex-1 space-y-0.5">
            <h4 className="text-lg font-bold text-foreground">Edit Task</h4>
            <p className="text-sm font-medium text-muted-foreground">
              Make changes to your task below.
            </p>
          </div>
          <button
            className="p-2 rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
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
              className="w-full h-12 pl-4 pr-16 rounded-[16px] bg-muted/50 text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-medium placeholder:text-muted-foreground/50 transition-all"
              placeholder="Task description..."
              disabled={busy}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none">
              <span
                className={
                  text.length >= 40
                    ? 'text-rose-500'
                    : 'text-muted-foreground/40'
                }
              >
                {text.length}/45
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={busy || !text.trim()}
              className="relative h-11 w-full rounded-full text-[14px] font-bold text-primary-foreground bg-primary shadow-sm ring-1 ring-white/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:grayscale transition-all overflow-hidden"
            >
              <span className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
              <span className="relative z-10">
                {busy ? 'Saving...' : 'Save Changes'}
              </span>
            </button>
            <button
              onClick={onClose}
              className="h-11 w-full rounded-full text-[14px] font-semibold text-secondary-foreground bg-secondary ring-1 ring-border hover:bg-secondary/80 active:scale-[0.98] transition-all"
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
