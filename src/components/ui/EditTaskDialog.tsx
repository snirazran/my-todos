'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pencil, X } from 'lucide-react';

interface Props {
  open: boolean;
  initialText: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (newText: string) => void | Promise<void>;
  title?: string;
}

const MAX_LENGTH = 45;

export function EditTaskDialog({
  open,
  initialText,
  busy,
  onClose,
  onSave,
  title = 'Edit task',
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cache the title so the slide-down exit animation can still render it
  // after the parent clears state.
  const lastTitleRef = useRef(title);
  useEffect(() => {
    if (open) lastTitleRef.current = title;
  }, [open, title]);
  const displayTitle = open ? title : lastTitleRef.current;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open, initialText]);

  if (!mounted) return null;

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    await onSave(trimmed);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="edit-task-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 z-[1500] bg-black/35"
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1501] flex justify-center sm:bottom-6">
            <motion.div
              key="edit-task-sheet"
              initial={{ y: '120%' }}
              animate={{ y: 0 }}
              exit={{ y: '120%' }}
              transition={{
                type: 'tween',
                ease: [0.32, 0.72, 0, 1],
                duration: 0.32,
              }}
              className="pointer-events-auto flex min-h-[42dvh] w-full flex-col rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-6 shadow-[0_-20px_45px_rgba(15,23,42,0.22)] ring-1 ring-border/70 sm:min-h-[360px] sm:max-w-[440px] sm:rounded-[28px] sm:pb-8 sm:shadow-2xl"
            >
              <div className="mx-auto flex w-full flex-1 flex-col">
                {/* Header */}
                <div className="relative mb-5 flex h-8 items-center justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute left-0 grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4 stroke-[3]" />
                  </button>
                  <h3 className="text-[16px] font-extrabold text-foreground">
                    {displayTitle}
                  </h3>
                </div>

                {/* Input row */}
                <div className="mb-4 flex items-center gap-2">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted text-primary">
                    <Pencil className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSave();
                        }
                        if (e.key === 'Escape') onClose();
                      }}
                      maxLength={MAX_LENGTH}
                      spellCheck={false}
                      autoComplete="off"
                      disabled={busy}
                      placeholder="Task name"
                      className="h-12 w-full rounded-[16px] bg-muted/50 pl-4 pr-14 text-lg font-medium text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-left"
                    />
                    {text.length >= 40 && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums ${
                          text.length >= MAX_LENGTH
                            ? 'text-rose-500'
                            : 'text-rose-400'
                        }`}
                      >
                        {text.length}/{MAX_LENGTH}
                      </span>
                    )}
                  </div>
                </div>

                {/* Save */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !text.trim()}
                  className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985] disabled:opacity-50"
                >
                  {busy ? (
                    'Saving...'
                  ) : (
                    <>
                      <Check className="h-4 w-4 stroke-[3]" />
                      Save changes
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
