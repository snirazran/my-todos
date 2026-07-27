'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  checklistPayout,
  normalizeChecklistRewards,
  type ChecklistItem,
} from '@/lib/checklist';

export type { ChecklistItem };
export { CHECKLIST_MAX_ITEMS };
export const CHECKLIST_ITEM_MAX = 120;

/**
 * One track carrying both readings: how far down the list you are, and where
 * the task's flies sit along the way. Notches mark the step counts that pay
 * out; the last fly is the end of the bar, so it needs no notch of its own.
 */
export function ChecklistProgress({
  items,
  completed = false,
  className = '',
  flyPaused = false,
}: {
  items: ChecklistItem[];
  completed?: boolean;
  className?: string;
  /** Hold the fly still — the task list can show many of these at once. */
  flyPaused?: boolean;
}) {
  const { doneCount: ticked, items: steps, budget } = checklistPayout(items, {
    completed,
  });
  const total = steps.length;
  if (total === 0) return null;
  // Finishing the task settles the whole list, so the track must not still
  // read half-empty.
  const doneCount = completed ? total : ticked;

  // One segment per fly, as wide as the run of steps that fly is waiting
  // behind. A discrete reward needs a discrete bar: filling a whole segment is
  // what catching a fly looks like.
  const at = steps.map((it, i) => (it.reward ? i + 1 : 0)).filter(Boolean);
  const segments = at.map((p, i) => {
    const from = i === 0 ? 0 : at[i - 1];
    const span = p - from;
    return {
      p,
      span,
      fill: Math.max(0, Math.min(1, (doneCount - from) / span)),
    };
  });
  const caught = segments.filter((s) => s.fill >= 1).length;
  const next = segments.find((s) => s.fill < 1);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex h-3 items-stretch gap-1.5">
        {segments.map((s) => {
          const full = s.fill >= 1;
          return (
            <div
              key={s.p}
              style={{ flexGrow: s.span }}
              className={`relative overflow-hidden rounded-full bg-muted ring-1 ring-inset transition-colors duration-300 ${
                full ? 'ring-primary/45' : 'ring-border/70'
              }`}
            >
              <motion.div
                initial={false}
                animate={{ width: `${s.fill * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <Fly
          size={20}
          y={-1}
          interactive={false}
          paused={flyPaused || caught === 0}
          oversample={1.5}
        />
        <span className="text-[11px] font-bold leading-none text-muted-foreground">
          {next ? (
            <>
              <span className="font-black text-foreground">
                {caught}/{budget}
              </span>{' '}
              caught · next at {next.p} of {total} steps
            </>
          ) : (
            <span className="font-black text-primary">
              All {budget} {budget === 1 ? 'fly' : 'flies'} caught
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function ChecklistCheckbox({
  checked,
  onToggle,
  size = 24,
  className = '',
}: {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onToggle}
      whileTap={{ scale: 0.82 }}
      aria-label={checked ? 'Mark not done' : 'Mark done'}
      aria-pressed={checked}
      className={`relative grid shrink-0 touch-manipulation place-items-center ${className}`}
      style={{ width: size + 16, height: size + 16, margin: -8 }}
    >
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
    </motion.button>
  );
}

const rowTransition = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };

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

  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const addRef = useRef<HTMLInputElement>(null);
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
    if (el) el.value = '';
    return true;
  };

  const atCap = items.length >= CHECKLIST_MAX_ITEMS;

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
        <div className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 transition-colors focus-within:bg-muted/30">
          <span className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[30%] border-2 border-dashed border-muted-foreground/35 text-muted-foreground/60">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <input
            ref={addRef}
            defaultValue=""
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
            className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none sm:text-[15px]"
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
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onCommit: () => void;
  onRemove: (refocus: boolean) => void;
  onEnter: () => void;
  registerInput: (el: HTMLInputElement | null) => void;
  onDragAt: (pointY: number) => void;
  onDrop: () => void;
  canDrag: boolean;
}) {
  const focusTextRef = useRef<string | null>(null);
  const dragControls = useDragControls();
  const [dragging, setDragging] = useState(false);

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
        className={`group flex min-h-[44px] items-center gap-3 rounded-xl px-2 transition-colors ${
          dragging
            ? 'bg-popover shadow-lg ring-1 ring-border/80'
            : 'focus-within:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25'
        }`}
      >
        <ChecklistCheckbox checked={item.done} onToggle={onToggle} size={21} />
        <input
          ref={registerInput}
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
          className={`min-w-0 flex-1 bg-transparent py-2 text-[16px] transition-colors duration-200 focus:outline-none sm:text-[15px] ${
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
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:text-rose-500 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
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
            className={`shrink-0 touch-none rounded-lg p-1.5 transition-colors cursor-grab active:cursor-grabbing ${
              dragging
                ? 'text-foreground'
                : 'text-muted-foreground/35 [@media(hover:hover)]:hover:text-muted-foreground'
            }`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </Reorder.Item>
  );
}
