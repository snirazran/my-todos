'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, List, ListOrdered } from 'lucide-react';

export function sanitize(html: string): string {
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
  autoFocus?: boolean;
}

export default function RichNotesEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Jot down notes, links, or details…',
  autoFocus = false,
}: RichNotesEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.innerHTML = sanitize(value ?? '');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/25">
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
        className="rich-notes block min-h-[96px] flex-1 overflow-y-auto px-4 py-3 text-[16px] leading-relaxed text-foreground focus:outline-none sm:text-[15px]"
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

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?])/gi;

function linkify(html: string): string {
  if (typeof window === 'undefined') return html;
  const holder = document.createElement('div');
  holder.innerHTML = sanitize(html);
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('a')) continue;
    URL_RE.lastIndex = 0;
    if (URL_RE.test(node.data)) targets.push(node);
  }
  for (const node of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(node.data))) {
      const start = m.index;
      if (start > last) frag.append(node.data.slice(last, start));
      const a = document.createElement('a');
      a.href = m[0].startsWith('www.') ? `https://${m[0]}` : m[0];
      a.textContent = m[0];
      frag.append(a);
      last = start + m[0].length;
    }
    if (last < node.data.length) frag.append(node.data.slice(last));
    node.replaceWith(frag);
  }
  holder.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:|tel:)/i.test(href)) a.removeAttribute('href');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  return holder.innerHTML;
}

async function openLink(href: string) {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform() && /^https?:/i.test(href)) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: href });
      return;
    }
  } catch {}
  window.open(href, '_blank', 'noopener,noreferrer');
}

const NOTES_CLAMP_PX = 132;

export function NotesView({
  value,
  onEdit,
}: {
  value: string;
  onEdit: () => void;
}) {
  const html = useMemo(() => linkify(value), [value]);
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > NOTES_CLAMP_PX + 8);
  }, [html]);

  const clamped = overflows && !showAll;

  return (
    <div className="relative">
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label="Edit notes"
        onClick={(e) => {
          const link = (e.target as HTMLElement).closest('a');
          if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href) void openLink(href);
            return;
          }
          if (window.getSelection()?.toString()) return;
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEdit();
          }
        }}
        style={clamped ? { maxHeight: NOTES_CLAMP_PX } : undefined}
        className={`rich-notes cursor-text overflow-hidden rounded-2xl px-3 py-2.5 text-[15px] leading-relaxed text-foreground/85 transition-colors [@media(hover:hover)]:hover:bg-muted/40 ${
          clamped
            ? '[mask-image:linear-gradient(to_bottom,black_65%,transparent)]'
            : ''
        }`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="ml-3 mt-0.5 text-[12px] font-bold text-primary"
        >
          {showAll ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
