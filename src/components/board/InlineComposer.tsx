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
    <div className="px-3 py-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Task name…"
        rows={1}
        className="w-full resize-none overflow-hidden leading-6 min-h-[40px] px-3 py-2 bg-white border rounded-md dark:bg-slate-800 border-slate-200 dark:border-slate-600"
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus={autoFocus}
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-white rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
          disabled={!value.trim()}
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md bg-slate-200 dark:bg-slate-600"
          title="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
