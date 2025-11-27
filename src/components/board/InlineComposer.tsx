'use client';

import * as React from 'react';
import { RotateCcw, CalendarCheck, X, Plus } from 'lucide-react';

type RepeatChoice = 'this-week' | 'weekly';

export default function InlineComposer({
  value,
  onChange,
  onConfirm, // (repeat: RepeatChoice) => void
  onCancel,
  autoFocus,
  /** If true, will scroll into view when mounted/focused */
  scrollIntoViewOnMount = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: (repeat: RepeatChoice) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  scrollIntoViewOnMount?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [repeat, setRepeat] = React.useState<RepeatChoice>('this-week');

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  React.useEffect(grow, [value, grow]);

  React.useEffect(() => {
    if (!scrollIntoViewOnMount) return;
    const el = taRef.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
      if (autoFocus) el.focus({ preventScroll: true });
    }, 10);
    return () => window.clearTimeout(id);
  }, [scrollIntoViewOnMount, autoFocus]);

  const disabled = !value.trim();
  const add = () => {
    if (!disabled) onConfirm(repeat);
  };

  return (
    <div className="px-3 py-3 rounded-2xl bg-white/90 dark:bg-slate-900/70 ring-1 ring-slate-200/80 dark:ring-slate-700/70 shadow-sm">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Task name?"
        rows={1}
        className={[
          'w-full resize-none overflow-hidden px-3 py-2',
          'text-base leading-5 md:text-sm md:leading-[1.25rem]',
          'min-h-[44px]',
          'bg-white/90 rounded-xl border-0 ring-1 ring-slate-200/80 dark:ring-slate-700/70',
          'placeholder:text-slate-400 dark:placeholder:text-slate-400',
          'focus:ring-2 focus:ring-purple-300 outline-none',
          'text-slate-900 dark:bg-slate-900/70 dark:text-slate-50',
          'touch-manipulation',
        ].join(' ')}
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            add();
          }
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus={autoFocus}
        inputMode="text"
      />

      {/* Segmented: Repeat choice (smaller, no-wrap) */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          onClick={() => setRepeat('this-week')}
          className={[
            'rounded-2xl ring-1 transition',
            // tighter paddings on mobile, normal on md+
            'px-2.5 py-2 sm:px-3 sm:py-2',
            repeat === 'this-week'
              ? 'ring-purple-500/40 shadow bg-gradient-to-br from-purple-500 to-pink-500 text-white'
              : 'ring-slate-200/80 bg-white/80 text-slate-900 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-slate-700/70',
          ].join(' ')}
          aria-pressed={repeat === 'this-week'}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CalendarCheck className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-[13px] sm:text-sm leading-none whitespace-nowrap">
              One-time
            </span>
          </div>
          <div className="text-[11px] sm:text-xs opacity-80 mt-1 leading-tight whitespace-nowrap">
            This week only
          </div>
        </button>

        <button
          type="button"
          onClick={() => setRepeat('weekly')}
          className={[
            'rounded-2xl ring-1 transition',
            'px-2.5 py-2 sm:px-3 sm:py-2',
            repeat === 'weekly'
              ? 'ring-purple-500/40 shadow bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100'
              : 'ring-slate-200/80 bg-white/80 text-slate-900 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-slate-700/70',
          ].join(' ')}
          aria-pressed={repeat === 'weekly'}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-[13px] sm:text-sm leading-none whitespace-nowrap">
              Repeats
            </span>
          </div>
          <div className="text-[11px] sm:text-xs opacity-80 mt-1 leading-tight whitespace-nowrap">
            Every week
          </div>
        </button>
      </div>

      {/* Commit row */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className={[
            'rounded-2xl ring-1 ring-purple-500/40 shadow',
            'bg-gradient-to-br from-purple-500 to-pink-500 text-white',
            'px-3 py-2 text-sm font-semibold',
            'hover:brightness-105 disabled:opacity-60',
            'inline-flex items-center justify-center gap-2',
          ].join(' ')}
          aria-label="Add task"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>

        <button
          type="button"
          onClick={onCancel}
          className={[
            'rounded-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/70',
            'bg-white/80 text-slate-800',
            'dark:bg-slate-900/60 dark:text-slate-100',
            'px-3 py-2 text-sm font-medium',
            'inline-flex items-center justify-center gap-2',
          ].join(' ')}
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
