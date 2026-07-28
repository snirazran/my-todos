'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  type PanInfo,
} from 'framer-motion';
import { GripVertical, Plus, X } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { hapticImpact, hapticSuccess, hapticTick } from '@/lib/haptics';
import { randomUUID } from '@/lib/uuid';
import {
  CHECKLIST_MAX_ITEMS,
  normalizeChecklistRewards,
  type ChecklistItem,
} from '@/lib/checklist';

export type { ChecklistItem };
export { CHECKLIST_MAX_ITEMS };
export const CHECKLIST_ITEM_MAX = 120;

/**
 * The line a checklist crosses to catch a fly. It sits between rows rather than
 * on one because the payout counts steps done, not which ones.
 */
export function ChecklistFlyLine({
  caught,
  at,
  total,
}: {
  caught: boolean;
  at: number;
  total: number;
}) {
  const rule = `h-px flex-1 transition-colors duration-300 ${
    caught ? 'bg-primary/60' : 'bg-primary/20'
  }`;
  return (
    <div
      aria-label={`${caught ? 'Caught' : 'Catches'} a fly at ${at} of ${total} steps done`}
      className="flex items-center gap-2 py-1.5"
    >
      <span className={rule} />
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 transition-colors duration-300 ${
          caught
            ? 'border-primary/40 bg-primary/15'
            : 'border-primary/20 bg-primary/5'
        }`}
      >
        <span
          className={`grid place-items-center transition-all duration-300 ${
            caught ? 'opacity-100' : 'opacity-40 grayscale'
          }`}
          style={{ width: 20, height: 20 }}
        >
          <Fly size={24} x={-2} y={-5} interactive={false} paused />
        </span>
        <span
          className={`text-[11px] font-black leading-none tabular-nums transition-colors duration-300 ${
            caught ? 'text-primary' : 'text-primary/50'
          }`}
        >
          +1
        </span>
      </span>
      <span className={rule} />
    </div>
  );
}

export function ChecklistCheckbox({
  checked,
  onToggle,
  size = 24,
  className = '',
  interactive = true,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
  /** Render as plain art when an enclosing control owns the tap. */
  interactive?: boolean;
}) {
  const boxClassName = `relative grid shrink-0 touch-manipulation place-items-center ${className}`;
  const boxStyle = { width: size + 16, height: size + 16, margin: -8 };
  const art = (
      <motion.span
        initial={false}
        animate={checked ? { scale: [1, 1.15, 1] } : { scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`grid place-items-center rounded-[30%] border-2 text-primary-foreground transition-colors duration-150 ${
          checked
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/40 bg-transparent [@media(hover:hover)]:hover:border-primary/60'
        }`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          style={{ width: size * 0.68, height: size * 0.68 }}
        >
          <motion.path
            d="M2.8 8.6 L6.2 11.8 L13.2 4.4"
            stroke="currentColor"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{
              pathLength: { duration: 0.2, ease: 'easeOut' },
              opacity: { duration: 0.08 },
            }}
          />
        </svg>
      </motion.span>
  );

  if (!interactive) {
    return (
      <span aria-hidden className={boxClassName} style={boxStyle}>
        {art}
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onToggle}
      whileTap={{ scale: 0.82 }}
      aria-label={checked ? 'Mark not done' : 'Mark done'}
      aria-pressed={checked}
      className={boxClassName}
      style={boxStyle}
    >
      {art}
    </motion.button>
  );
}

const rowTransition = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };

const TEXT_CLASS =
  'min-w-0 flex-1 resize-none overflow-hidden break-words bg-transparent py-[11px] text-[16px] leading-[22px] focus:outline-none sm:text-[15px]';

function autoSize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function useAutoSize() {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => autoSize(ref.current), []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resize]);
  return { ref, resize };
}

interface ChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[], opts: { persist: boolean }) => void;
  /** Item id to focus on mount, or 'new' for the add row. */
  autoFocus?: string | null;
  /** Classes for the root scroll container. */
  className?: string;
}

export function ChecklistEditor({
  items,
  onChange,
  autoFocus = null,
  className = '',
}: ChecklistEditorProps) {
  // Synchronous source of truth: blur→click sequences fire before React
  // re-renders, so handlers must never read a stale render closure.
  const latestRef = useRef(items);
  useEffect(() => {
    latestRef.current = items;
  }, [items]);

  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const addRef = useRef<HTMLTextAreaElement>(null);
  const pendingFocusRef = useRef<string | null>(autoFocus);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const el =
      target === 'new' ? addRef.current : inputRefs.current.get(target);
    if (!el) return;
    pendingFocusRef.current = null;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {}
    el.scrollIntoView({ block: 'nearest' });
  });

  const update = (
    updater: (cur: ChecklistItem[]) => ChecklistItem[],
    persist: boolean,
  ) => {
    const next = normalizeChecklistRewards(updater(latestRef.current));
    latestRef.current = next;
    onChange(next, { persist });
  };

  const toggle = (id: string) => {
    let becameDone = false;
    update((cur) => {
      const next = cur.map((it) =>
        it.id === id ? { ...it, done: !it.done } : it,
      );
      becameDone = next.find((it) => it.id === id)?.done ?? false;
      return next;
    }, true);
    if (becameDone && latestRef.current.every((it) => it.done)) {
      hapticSuccess();
    } else {
      hapticTick();
    }
  };

  const setText = (id: string, text: string) =>
    update(
      (cur) => cur.map((it) => (it.id === id ? { ...it, text } : it)),
      false,
    );

  const commitText = () => update((cur) => cur, true);

  const remove = (id: string, refocus: boolean) => {
    const cur = latestRef.current;
    const idx = cur.findIndex((it) => it.id === id);
    if (refocus) {
      pendingFocusRef.current = idx > 0 ? cur[idx - 1].id : 'new';
    }
    inputRefs.current.delete(id);
    update((c) => c.filter((it) => it.id !== id), true);
  };

  const insertAfter = (id: string) => {
    if (latestRef.current.length >= CHECKLIST_MAX_ITEMS) {
      addRef.current?.focus();
      return;
    }
    const fresh = { id: randomUUID(), text: '', done: false };
    pendingFocusRef.current = fresh.id;
    update((cur) => {
      const idx = cur.findIndex((it) => it.id === id);
      const next = [...cur];
      next.splice(idx + 1, 0, fresh);
      return next;
    }, false);
  };

  const addFromDraft = () => {
    const el = addRef.current;
    const text = el?.value.trim().slice(0, CHECKLIST_ITEM_MAX) ?? '';
    if (!text || latestRef.current.length >= CHECKLIST_MAX_ITEMS) return false;
    update(
      (cur) => [...cur, { id: randomUUID(), text, done: false }],
      true,
    );
    if (el) {
      el.value = '';
      autoSize(el);
    }
    return true;
  };

  const atCap = items.length >= CHECKLIST_MAX_ITEMS;
  const doneCount = items.filter((it) => it.done).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollAt = (pointY: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 48;
    if (pointY < rect.top + margin) el.scrollTop -= 10;
    else if (pointY > rect.bottom - margin) el.scrollTop += 10;
  };

  return (
    <motion.div
      ref={scrollRef}
      layoutScroll
      className={`flex flex-col ${className}`}
    >
      <Reorder.Group
        as="div"
        axis="y"
        values={items}
        onReorder={(next: ChecklistItem[]) => update(() => next, false)}
        className="flex flex-col"
      >
        <AnimatePresence initial={false}>
          {items.map((it, index) => (
            <ChecklistRow
              key={it.id}
              item={it}
              at={index + 1}
              total={items.length}
              doneCount={doneCount}
              onToggle={() => toggle(it.id)}
              onTextChange={(text) => setText(it.id, text)}
              onCommit={commitText}
              onRemove={(refocus) => remove(it.id, refocus)}
              onEnter={() => {
                if (!it.text.trim()) {
                  inputRefs.current.get(it.id)?.blur();
                  return;
                }
                commitText();
                insertAfter(it.id);
              }}
              registerInput={(el) => {
                if (el) inputRefs.current.set(it.id, el);
                else inputRefs.current.delete(it.id);
              }}
              onDragAt={autoScrollAt}
              onDrop={commitText}
              canDrag={items.length > 1}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {!atCap && (
        <div className="flex min-h-[44px] items-start gap-3 rounded-xl px-2 transition-colors focus-within:bg-muted/30">
          <span className="mt-[10px] grid h-[23px] w-[23px] shrink-0 place-items-center rounded-[30%] border-2 border-dashed border-muted-foreground/35 text-muted-foreground/60">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <textarea
            ref={addRef}
            rows={1}
            defaultValue=""
            onInput={(e) => autoSize(e.currentTarget)}
            maxLength={CHECKLIST_ITEM_MAX}
            enterKeyHint="next"
            autoComplete="off"
            autoCorrect="on"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!addFromDraft()) e.currentTarget.blur();
                else
                  requestAnimationFrame(() =>
                    addRef.current?.scrollIntoView({ block: 'nearest' }),
                  );
              } else if (e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
            onBlur={addFromDraft}
            placeholder="Add a step…"
            className={`${TEXT_CLASS} text-foreground placeholder:text-muted-foreground/50`}
          />
        </div>
      )}

      {atCap && (
        <p className="mt-2 px-2 text-[11px] font-bold text-muted-foreground">
          Maximum {CHECKLIST_MAX_ITEMS} steps reached.
        </p>
      )}
    </motion.div>
  );
}

function ChecklistRow({
  item,
  at,
  total,
  doneCount,
  onToggle,
  onTextChange,
  onCommit,
  onRemove,
  onEnter,
  registerInput,
  onDragAt,
  onDrop,
  canDrag,
}: {
  item: ChecklistItem;
  at: number;
  total: number;
  doneCount: number;
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onCommit: () => void;
  onRemove: (refocus: boolean) => void;
  onEnter: () => void;
  registerInput: (el: HTMLTextAreaElement | null) => void;
  onDragAt: (pointY: number) => void;
  onDrop: () => void;
  canDrag: boolean;
}) {
  const focusTextRef = useRef<string | null>(null);
  const dragControls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const { ref: textRef, resize } = useAutoSize();

  useLayoutEffect(resize, [item.text, resize]);

  return (
    <Reorder.Item
      as="div"
      value={item}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={rowTransition}
      onDragStart={() => {
        setDragging(true);
        hapticImpact();
      }}
      onDrag={(_e: PointerEvent, info: PanInfo) => onDragAt(info.point.y)}
      onDragEnd={() => {
        setDragging(false);
        hapticTick();
        onDrop();
      }}
      className={`${dragging ? 'z-10' : 'overflow-hidden'}`}
    >
      <div
        className={`group flex min-h-[44px] items-start gap-3 rounded-xl px-2 transition-colors ${
          dragging
            ? 'bg-popover shadow-lg ring-1 ring-border/80'
            : 'focus-within:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25'
        }`}
      >
        <span className="grid h-11 shrink-0 place-items-center">
          <ChecklistCheckbox checked={item.done} onToggle={onToggle} size={23} />
        </span>
        <textarea
          ref={(el) => {
            textRef.current = el;
            registerInput(el);
          }}
          rows={1}
          value={item.text}
          maxLength={CHECKLIST_ITEM_MAX}
          enterKeyHint="next"
          autoComplete="off"
          autoCorrect="on"
          placeholder="Untitled step"
          onFocus={() => {
            focusTextRef.current = item.text;
          }}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={() => {
            if (!item.text.trim()) {
              onRemove(false);
              return;
            }
            if (focusTextRef.current !== item.text) onCommit();
            focusTextRef.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            } else if (e.key === 'Backspace' && item.text === '') {
              e.preventDefault();
              onRemove(true);
            } else if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          className={`${TEXT_CLASS} transition-colors duration-200 ${
            item.done
              ? 'text-muted-foreground/70 line-through decoration-muted-foreground/50'
              : 'text-foreground'
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onRemove(false)}
          aria-label="Remove step"
          className="mt-2 shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:text-rose-500 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
        {canDrag && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Reorder step"
            onPointerDown={(e) => {
              e.preventDefault();
              dragControls.start(e);
            }}
            className={`mt-2 shrink-0 touch-none rounded-lg p-1.5 transition-colors cursor-grab active:cursor-grabbing ${
              dragging
                ? 'text-foreground'
                : 'text-muted-foreground/35 [@media(hover:hover)]:hover:text-muted-foreground'
            }`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {item.reward && !dragging && (
        <ChecklistFlyLine caught={doneCount >= at} at={at} total={total} />
      )}
    </Reorder.Item>
  );
}
