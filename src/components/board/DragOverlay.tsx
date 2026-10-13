'use client';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { TaskMetaLine } from '@/components/ui/TaskMeta';
import { LeapStageMark, StepPips } from '@/components/ui/TaskAdornments';
import { ChecklistCheckbox } from './ChecklistEditor';
import Fly from '@/components/ui/fly';

export default function DragOverlay({
  x,
  y,
  dx,
  dy,
  width,
  height,
  innerRef,
  text,
  tags,
  startTime,
  endTime,
  checklist,
  taskType,
  bundleCount = 1,
  compact = false,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  innerRef?: (el: HTMLDivElement | null) => void;
  text: string;
  tags?: { id: string; name: string; color: string }[];
  taskType?: 'weekly' | 'regular' | 'backlog';
  calendarEventId?: string;
  startTime?: string;
  endTime?: string;
  reminder?: string;
  notes?: string;
  checklist?: { id: string; text: string; done: boolean }[];
  frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
  bundleCount?: number;
  compact?: boolean;
}) {
  const stacked = Math.min(Math.max(bundleCount - 1, 0), 3);
  const steps = checklist ?? [];
  const stepsDone = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  const tag = tags?.find((t) => !!t.color);

  return (
    <div
      ref={innerRef}
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      style={{
        transform: `translate3d(${x - dx}px, ${y - dy}px, 0)`,
        width: `${width}px`,
        willChange: 'transform',
      }}
    >
      <motion.div
        initial={false}
        animate={{ scale: compact ? 0.42 : 1, opacity: compact ? 0.92 : 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        style={{ transformOrigin: `${dx}px ${dy}px` }}
      >
        {Array.from({ length: stacked }, (_, i) => stacked - i).map((depth) => (
          <motion.div
            key={depth}
            initial={{ opacity: 0, y: 0, rotate: 0 }}
            animate={{
              opacity: 1,
              y: -depth * 5,
              x: depth * 3,
              rotate: -1.5 + depth * 2,
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="absolute inset-x-0 top-0 rounded-2xl bg-card shadow-[0_2px_6px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] dark:ring-white/10"
            style={{ height, zIndex: -depth }}
          />
        ))}

        {bundleCount > 1 && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="absolute -right-2 -top-2 z-10 grid h-7 min-w-7 place-items-center rounded-full bg-primary px-1.5 text-[13px] font-black tabular-nums text-primary-foreground shadow-md ring-2 ring-card"
          >
            {bundleCount}
          </motion.span>
        )}

        <div
          data-drag-lift
          data-tilt
          className="relative flex select-none items-center gap-2.5 rounded-2xl bg-card py-3 pl-3.5 pr-2.5 ring-1 ring-black/[0.06] dark:ring-white/10 md:gap-2 md:py-2.5 md:pl-3 md:pr-2"
          style={{ minHeight: height }}
        >
          {tag && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-[24px] max-h-[60%] w-[3px] -translate-y-1/2 rounded-r-full opacity-90"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[16px] font-semibold leading-snug text-foreground md:text-[15px]">
              {text}
              {taskType === 'weekly' && (
                <LeapStageMark className="ml-1.5 -translate-y-px" />
              )}
            </span>
            <TaskMetaLine
              tags={tags}
              startTime={startTime}
              endTime={endTime}
            />
            {steps.length > 0 && (
              <span className="mt-0.5 flex h-7 min-w-0 items-center gap-2">
                <span className="flex w-[22px] shrink-0 justify-center">
                  {nextStep ? (
                    <ChecklistCheckbox
                      size={18}
                      checked={false}
                      onToggle={() => {}}
                      interactive={false}
                    />
                  ) : (
                    <CheckCircle2 className="h-[18px] w-[18px] text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/65 md:text-[13.5px]">
                  {nextStep
                    ? nextStep.text || 'Untitled step'
                    : `All ${steps.length} steps done`}
                </span>
                <StepPips items={steps as never} done={stepsDone} />
              </span>
            )}
          </span>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/[0.16] ring-1 ring-inset ring-primary/25 md:h-10 md:w-10">
            <Fly size={36} y={-3} paused interactive={false} alwaysPlay />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
