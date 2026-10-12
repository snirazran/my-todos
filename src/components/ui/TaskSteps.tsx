'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ListChecks } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { ChecklistCheckbox } from '@/components/board/ChecklistEditor';
import { StepPips } from '@/components/ui/TaskAdornments';
import type { ChecklistItem } from '@/lib/checklist';

const stopRowGesture = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
};

export function StepsStrip({
  taskText,
  items,
  doneCount,
  open,
  isDone,
  onToggleOpen,
  onToggleItem,
}: {
  taskText: string;
  items: ChecklistItem[];
  doneCount: number;
  open: boolean;
  isDone: boolean;
  onToggleOpen: () => void;
  onToggleItem?: (itemId: string) => void;
}) {
  const total = items.length;
  const allDone = doneCount === total;
  const next = items.find((it) => !it.done);
  const canTick = !!onToggleItem && !isDone;
  const stepsLabel = `${total} ${total === 1 ? 'step' : 'steps'}`;

  return (
    <div
      {...stopRowGesture}
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5"
    >
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="list"
            initial={{ height: 28, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 28, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col">
              {items.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!canTick}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => onToggleItem?.(item.id)}
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
              aria-expanded
              aria-label={`Hide steps for ${taskText}`}
              onClick={onToggleOpen}
              className="mb-0.5 flex h-7 items-center gap-2 rounded-lg pr-2 text-[12px] font-bold text-muted-foreground/70 transition-colors [@media(hover:hover)]:hover:text-foreground"
            >
              <span className="flex w-[22px] shrink-0 justify-center">
                <ChevronDown className="h-4 w-4 rotate-180" strokeWidth={2.75} />
              </span>
              <StepPips items={items} done={doneCount} />
              Hide
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="line"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex h-7 max-w-full items-center gap-2"
          >
            <span className="flex w-[22px] flex-shrink-0 justify-center">
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
              onClick={onToggleOpen}
              className="-mr-1.5 flex h-full min-w-0 touch-manipulation items-center gap-2 rounded-lg pr-1.5 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/50"
            >
              <span className="relative min-w-0 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={next && !isDone ? next.id : allDone ? 'done' : 'steps'}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
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
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
