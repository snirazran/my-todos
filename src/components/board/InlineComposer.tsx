'use client';

import * as React from 'react';
import Fly from '../ui/fly';

export default function InlineComposer({
  value,
  onChange,
  onConfirm,
  onCancel,
  autoFocus,
  /** If true, will scroll into view when mounted/focused */
  scrollIntoViewOnMount = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
  scrollIntoViewOnMount?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  // Resize with content
  React.useEffect(grow, [value, grow]);

  // Ensure the composer is visible when it opens (esp. near the bottom)
  React.useEffect(() => {
    if (!scrollIntoViewOnMount) return;
    const el = taRef.current;
    if (!el) return;

    // Small timeout lets layout settle before scrolling
    const id = window.setTimeout(() => {
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
      // Focus after scroll to avoid iOS re-centering quirks
      if (autoFocus) el.focus({ preventScroll: true });
    }, 10);

    return () => window.clearTimeout(id);
  }, [scrollIntoViewOnMount, autoFocus]);

  return (
    <div className="px-3 py-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-900/30 ring-1 ring-emerald-600/15">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Task name…"
        rows={1}
        // Prevent iOS zoom by using ≥16px on mobile; keep your tighter md+ style
        className={[
          'w-full resize-none overflow-hidden px-3 py-2',
          'text-base leading-5 md:text-sm md:leading-[1.25rem]', // ← key change
          'min-h-[44px]', // slightly taller to match 16px line-height comfortably
          'bg-white/90 rounded-xl border-0 ring-1 ring-emerald-700/20',
          'placeholder:text-emerald-900/40 dark:placeholder:text-emerald-200/40',
          'focus:ring-2 focus:ring-lime-400 outline-none',
          'dark:bg-emerald-950/50 dark:text-emerald-50',
          'touch-manipulation', // nicer tap handling on mobile
        ].join(' ')}
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus={autoFocus}
        // Helps iOS keyboards choose better layout, does not affect zoom
        inputMode="text"
      />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={onConfirm}
          className={[
            'rounded-2xl ring-1 ring-emerald-700/30 shadow',
            'bg-gradient-to-br from-emerald-500 to-lime-500 text-emerald-950',
            'px-3 py-2 text-sm font-medium',
            'hover:brightness-105 disabled:opacity-60',
          ].join(' ')}
          disabled={!value.trim()}
        >
          <span className="inline-flex items-center gap-2">
            Add a <Fly size={24} x={-2} y={-4} />
          </span>
        </button>

        <button
          onClick={onCancel}
          className={[
            'rounded-2xl ring-1 ring-emerald-700/10',
            'bg-emerald-900/10 text-emerald-900',
            'dark:bg-emerald-900/40 dark:text-emerald-100',
            'px-3 py-2 text-sm',
          ].join(' ')}
          title="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
