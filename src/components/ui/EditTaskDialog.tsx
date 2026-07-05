'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';

interface Props {
  open: boolean;
  initialText: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (newText: string) => void | Promise<void>;
  title?: string;
}

const MAX_LENGTH = 100;

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);

  if (!mounted) return null;

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    await onSave(trimmed);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:max-w-[440px]"
    >
      {() => (
        <div className="flex w-full flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-1 sm:pb-8">
              <div className="mx-auto flex w-full flex-1 flex-col">
                {/* Header */}
                <div className="relative mb-5 flex h-8 items-center justify-center">
                  <h3 className="text-[16px] font-extrabold text-foreground">
                    {displayTitle}
                  </h3>
                </div>

                {/* Input row */}
                <div className="mb-4 flex items-start gap-2">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted text-primary">
                    <Pencil className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <div className="relative flex-1">
                    <textarea
                      ref={inputRef}
                      value={text}
                      rows={1}
                      onChange={(e) =>
                        setText(e.target.value.replace(/\s*\n+\s*/g, ' '))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!e.shiftKey) handleSave();
                        }
                        if (e.key === 'Escape') onClose();
                      }}
                      maxLength={MAX_LENGTH}
                      spellCheck={false}
                      autoComplete="off"
                      disabled={busy}
                      placeholder="Task name"
                      className="block min-h-12 max-h-[136px] w-full resize-none overflow-y-auto rounded-[16px] bg-muted/50 py-3 pl-4 pr-14 text-lg font-medium leading-6 text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-left"
                    />
                    {text.length >= MAX_LENGTH - 5 && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute bottom-2 right-3 text-[11px] font-bold tabular-nums ${
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
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985] disabled:opacity-50"
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
        </div>
      )}
    </BaseSheet>
  );
}
