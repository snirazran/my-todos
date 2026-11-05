'use client';
import { motion } from 'framer-motion';
import { TaskMetaLine } from '@/components/ui/TaskMeta';
import { StepsChip } from '@/components/ui/TaskSteps';
import { TASK_FLY_SLOT } from '@/components/ui/taskSurfaces';
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
            className="absolute inset-x-0 top-0 rounded-[14px] bg-card shadow-[0_2px_6px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] dark:ring-white/10"
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
          className="relative flex select-none items-center gap-2.5 rounded-[14px] bg-card py-3 pl-3.5 pr-2.5 ring-1 ring-black/[0.04] dark:ring-white/10 md:gap-2 md:py-2.5 md:pl-3 md:pr-2"
          style={{ minHeight: height }}
        >
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-[16px] font-semibold leading-snug text-foreground md:text-[15px]">
              {text}
            </span>
            <TaskMetaLine
              tags={tags}
              startTime={startTime}
              endTime={endTime}
              trailing={
                steps.length > 0 ? (
                  <StepsChip done={stepsDone} total={steps.length} />
                ) : undefined
              }
            />
          </span>
          <span className={`grid h-11 w-11 shrink-0 place-items-center md:h-10 md:w-10 ${TASK_FLY_SLOT}`}>
            <Fly size={36} y={-3} paused interactive={false} alwaysPlay />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
