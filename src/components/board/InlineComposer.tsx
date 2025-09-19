'use client';

import * as React from 'react';

export default function InlineComposer({
  value,
  onChange,
  onConfirm,
  onCancel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  React.useEffect(grow, [value, grow]);

  return (
    <div className="px-3 py-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-900/30 ring-1 ring-emerald-600/15">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Task name…"
        rows={1}
        className={[
          // smaller type + tighter vertical rhythm
          'w-full resize-none overflow-hidden px-3 py-2',
          'text-sm leading-[1.25rem]', // 14px text, 20px line-height
          'min-h-[38px]',
          'bg-white/90 rounded-xl border-0 ring-1 ring-emerald-700/20',
          'placeholder:text-emerald-900/40 dark:placeholder:text-emerald-200/40',
          'focus:ring-2 focus:ring-lime-400 outline-none',
          'dark:bg-emerald-950/50 dark:text-emerald-50',
        ].join(' ')}
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus={autoFocus}
      />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={onConfirm}
          className={[
            'rounded-2xl ring-1 ring-emerald-700/30 shadow',
            'bg-gradient-to-br from-emerald-500 to-lime-500 text-emerald-950',
            // smaller text & padding
            'px-3 py-2 text-sm font-medium',
            'hover:brightness-105 disabled:opacity-60',
          ].join(' ')}
          disabled={!value.trim()}
        >
          Add a fly
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
