'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ListChecks } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { ChecklistCheckbox } from '@/components/board/ChecklistEditor';
import { StepPips } from '@/components/ui/TaskAdornments';
import { listSlide, slideFollowers } from '@/lib/taskEntrance';
import type { ChecklistItem } from '@/lib/checklist';

const stopRowGesture = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

type Flip = { height: number; siblings: [HTMLElement, number][] };

export function StepsChip({
  done,
  total,
  open = false,
  onClick,
  label,
}: {
  done: number;
  total: number;
  open?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  label?: string;
}) {
  const allDone = total > 0 && done === total;
  const body = (
    <>
      <ListChecks className="h-3.5 w-3.5" strokeWidth={2.5} />
      {done}/{total}
      {onClick && (
        <ChevronDown
          aria-hidden
          className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={3}
        />
      )}
    </>
  );
  const look = `-my-1.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-bold tabular-nums leading-none transition-colors ${
    allDone
      ? 'bg-primary/10 text-primary'
      : 'bg-foreground/[0.05] text-muted-foreground dark:bg-white/[0.07]'
  }`;
  if (!onClick) {
    return (
      <span aria-hidden className={look}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      {...stopRowGesture}
      onClick={onClick}
      className={`${look} touch-manipulation [@media(hover:hover)]:hover:bg-foreground/[0.09]`}
    >
      {body}
    </button>
  );
}

export function StepsStrip({
  taskText,
  items,
  doneCount,
  open,
  isDone,
  onToggleOpen,
  onToggleItem,
  slideRows = true,
  renderMeta,
}: {
  taskText: string;
  items: ChecklistItem[];
  doneCount: number;
  open: boolean;
  isDone: boolean;
  onToggleOpen: () => void;
  onToggleItem?: (itemId: string) => void;
  slideRows?: boolean;
  renderMeta: (chip: React.ReactNode) => React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<Flip | null>(null);
  const total = items.length;
  const canTick = !!onToggleItem && !isDone;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const root = rootRef.current;
    const col = root?.parentElement;
    const flexRow = col?.parentElement;
    if (root && col && flexRow) {
      const siblings: [HTMLElement, number][] = [];
      Array.from(flexRow.children).forEach((el) => {
        if (el !== col && el instanceof HTMLElement) {
          siblings.push([el, el.getBoundingClientRect().top]);
        }
      });
      flipRef.current = { height: root.offsetHeight, siblings };
    }
    onToggleOpen();
  };

  useLayoutEffect(() => {
    const flip = flipRef.current;
    flipRef.current = null;
    const root = rootRef.current;
    if (!flip || !root || reduceMotion || typeof root.animate !== 'function') {
      return;
    }
    const slide = listSlide();
    const spring = { duration: slide.duration, easing: slide.easing };
    flip.siblings.forEach(([el, top]) => {
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      el.animate(
        [
          { transform: `translate3d(0, ${dy}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { ...spring, composite: 'add' },
      );
    });
    const row = slideRows ? root.closest<HTMLElement>('[data-row]') : null;
    if (row) slideFollowers(row, root.offsetHeight - flip.height);

    if (open) {
      root.querySelectorAll<HTMLElement>('[data-step-in]').forEach((el, i) => {
        el.animate(
          [
            { opacity: 0, transform: 'translate3d(0, -6px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          {
            duration: 260,
            delay: Math.min(i, 8) * 22,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'backwards',
          },
        );
      });
    }
  }, [open, reduceMotion, slideRows]);

  return (
    <div ref={rootRef}>
      {renderMeta(
        <StepsChip
          done={doneCount}
          total={total}
          open={open}
          onClick={toggle}
          label={
            open
              ? `Hide steps for ${taskText}`
              : `Show steps for ${taskText}, ${doneCount} of ${total} done`
          }
        />,
      )}
      {open && (
        <div className="mt-1.5">
          <ul className="flex flex-col">
            {items.map((item, i) => (
              <li key={item.id} data-step-in>
                <button
                  type="button"
                  disabled={!canTick}
                  {...stopRowGesture}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleItem?.(item.id);
                  }}
                  aria-pressed={item.done}
                  className="-ml-1 flex min-h-[34px] w-[calc(100%+0.25rem)] touch-manipulation items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 text-left transition-colors disabled:cursor-default active:bg-muted/60 [@media(hover:hover)]:hover:bg-muted/40"
                >
                  <span className="flex w-[22px] shrink-0 justify-center">
                    <ChecklistCheckbox
                      size={18}
                      checked={item.done}
                      onToggle={() => onToggleItem?.(item.id)}
                      interactive={false}
                    />
                  </span>
                  <span
                    className={`min-w-0 flex-1 break-words text-[13.5px] font-semibold leading-snug transition-colors duration-200 md:text-[14px] ${
                      item.done
                        ? 'text-muted-foreground/60 line-through decoration-muted-foreground/40'
                        : 'text-foreground/80'
                    }`}
                  >
                    {item.text || 'Untitled step'}
                  </span>
                  {item.reward && (
                    <span
                      aria-label="Pays a fly"
                      className={`shrink-0 transition-[opacity,filter] duration-300 ${
                        doneCount >= i + 1 ? '' : 'opacity-40 grayscale'
                      }`}
                      style={{ width: 18, height: 18 }}
                    >
                      <Fly size={22} x={-2} y={-3} interactive={false} paused />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-step-in
            aria-expanded
            aria-label={`Hide steps for ${taskText}`}
            {...stopRowGesture}
            onClick={toggle}
            className="mb-0.5 flex h-7 items-center gap-2 rounded-lg pr-2 text-[12px] font-bold text-muted-foreground/70 transition-colors [@media(hover:hover)]:hover:text-foreground"
          >
            <span className="flex w-[22px] shrink-0 justify-center">
              <ChevronDown className="h-4 w-4 rotate-180" strokeWidth={2.75} />
            </span>
            <StepPips items={items} done={doneCount} />
            Hide
          </button>
        </div>
      )}
    </div>
  );
}
