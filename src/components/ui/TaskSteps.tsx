'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ListChecks } from 'lucide-react';
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

export function StepsStrip({
  taskText,
  items,
  doneCount,
  open,
  isDone,
  onToggleOpen,
  onToggleItem,
  slideRows = true,
}: {
  taskText: string;
  items: ChecklistItem[];
  doneCount: number;
  open: boolean;
  isDone: boolean;
  onToggleOpen: () => void;
  onToggleItem?: (itemId: string) => void;
  slideRows?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<Flip | null>(null);
  const total = items.length;
  const allDone = doneCount === total;
  const next = items.find((it) => !it.done);
  const canTick = !!onToggleItem && !isDone;
  const stepsLabel = `${total} ${total === 1 ? 'step' : 'steps'}`;

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
    } else {
      root.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        easing: 'ease-out',
      });
    }
  }, [open, reduceMotion, slideRows]);

  return (
    <div ref={rootRef} className="mt-0.5">
      {open ? (
        <div>
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
      ) : (
        <div className="flex h-7 max-w-full items-center gap-2">
          <span
            {...stopRowGesture}
            className="flex w-[22px] flex-shrink-0 justify-center"
          >
            {next && canTick ? (
              <ChecklistCheckbox
                size={18}
                checked={false}
                onToggle={() => onToggleItem?.(next.id)}
              />
            ) : (
              <span
                aria-hidden
                className={allDone ? 'text-primary' : 'text-muted-foreground/70'}
              >
                {allDone ? (
                  <CheckCircle2 className="h-[18px] w-[18px]" />
                ) : (
                  <ListChecks className="h-[18px] w-[18px]" />
                )}
              </span>
            )}
          </span>
          <button
            type="button"
            aria-expanded={false}
            aria-label={`Show steps for ${taskText}, ${doneCount} of ${total} done`}
            {...stopRowGesture}
            onClick={toggle}
            className="-mr-1.5 flex h-full min-w-0 touch-manipulation items-center gap-2 rounded-lg pr-1 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/50"
          >
            <span className="relative min-w-0 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={next && !isDone ? next.id : allDone ? 'done' : 'steps'}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  className={`block truncate text-[13px] font-semibold leading-[1.35] md:text-[14px] ${
                    allDone ? 'text-primary' : 'text-foreground/65'
                  }`}
                >
                  {next && !isDone
                    ? next.text || 'Untitled step'
                    : allDone
                      ? `All ${stepsLabel} done`
                      : stepsLabel}
                </motion.span>
              </AnimatePresence>
            </span>
            <StepPips items={items} done={doneCount} />
            <ChevronDown
              aria-hidden
              className="h-4 w-4 shrink-0 text-muted-foreground/55"
              strokeWidth={2.75}
            />
          </button>
        </div>
      )}
    </div>
  );
}
