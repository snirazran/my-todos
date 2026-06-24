'use client';

import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Strikethrough, List, ListOrdered } from 'lucide-react';

function sanitize(html: string): string {
  if (typeof window === 'undefined') return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  holder.querySelectorAll('script,style').forEach((el) => el.remove());
  holder.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (
        /^on/i.test(attr.name) ||
        (attr.name === 'href' && /^\s*javascript:/i.test(attr.value))
      )
        el.removeAttribute(attr.name);
    });
  });
  return holder.innerHTML;
}

export interface RichNotesEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export default function RichNotesEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Jot down notes, links, or details…',
}: RichNotesEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const clean = sanitize(value ?? '');
    if (el.innerHTML !== clean) el.innerHTML = clean;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    if (!el.textContent?.trim() && !el.querySelector('li, img')) el.innerHTML = '';
    onChange(el.innerHTML);
  };

  const exec = (command: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false);
    emit();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/25">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-primary/15 bg-primary/[0.04] px-1.5 py-1">
        <ToolbarButton label="Bold" onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" strokeWidth={2.75} />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" strokeWidth={2.75} />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" onClick={() => exec('strikeThrough')}>
          <Strikethrough className="h-4 w-4" strokeWidth={2.75} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border/60" />
        <ToolbarButton label="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" strokeWidth={2.75} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" strokeWidth={2.75} />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Notes"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={onBlur}
        className="rich-notes block min-h-[120px] max-h-full flex-1 overflow-y-auto px-4 py-3.5 text-[16px] leading-relaxed text-foreground focus:outline-none sm:text-[15px]"
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary active:scale-95"
    >
      {children}
    </button>
  );
}
