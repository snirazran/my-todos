import React from 'react';
import {
  Bell,
  CalendarDays,
  Clock,
  Flame,
  ListChecks,
  StickyNote,
  Timer,
} from 'lucide-react';
import { formatFocusSpan } from '@/components/ui/TaskAdornments';
import { cn } from '@/lib/utils';

export type TaskMetaTag = { id: string; name: string; color?: string };

export function TaskMeta({
  startTime,
  endTime,
  reminder,
  tags,
  streak,
  calendarEventId,
  hasNotes,
  checklist,
  isNext = false,
  isDone = false,
  compact = false,
  className,
}: {
  startTime?: string;
  endTime?: string;
  reminder?: string | boolean | null;
  tags?: TaskMetaTag[];
  streak?: number;
  calendarEventId?: string | null;
  hasNotes?: boolean;
  checklist?: { done: number; total: number } | null;
  isNext?: boolean;
  isDone?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const items: { key: string; node: React.ReactNode }[] = [];
  const iconSize = compact ? 'h-3 w-3' : 'h-3 w-3 md:h-3.5 md:w-3.5';
  const flagSize = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';

  if (startTime) {
    const TimeIcon = reminder ? Bell : Clock;
    const highlight = isNext && !isDone;
    items.push({
      key: 'time',
      node: (
        <span
          className={cn(
            'inline-flex items-center gap-1 tabular-nums',
            highlight && 'text-primary',
          )}
        >
          {highlight ? (
            <span
              className={cn(
                'mr-0.5 font-black uppercase tracking-wide',
                compact ? 'text-[10px]' : 'text-[11px] md:text-[12px]',
              )}
            >
              Next
            </span>
          ) : (
            <TimeIcon className={cn(iconSize, 'flex-shrink-0')} />
          )}
          {endTime && endTime !== startTime
            ? `${startTime}–${endTime}`
            : startTime}
        </span>
      ),
    });
  }

  for (const tag of tags ?? []) {
    items.push({
      key: `tag-${tag.id}`,
      node: (
        <span className="inline-flex min-w-0 items-center gap-1">
          <span
            aria-hidden="true"
            className={cn(
              'flex-shrink-0 rounded-full',
              compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
            )}
            style={{ backgroundColor: tag.color || '#6366f1' }}
          />
          <span className="truncate">{tag.name}</span>
        </span>
      ),
    });
  }

  if ((streak ?? 0) > 0) {
    items.push({
      key: 'streak',
      node: (
        <span
          className="inline-flex flex-shrink-0 items-center gap-0.5 text-orange-500"
          title={`${streak} in a row`}
        >
          <Flame className={flagSize} fill="currentColor" />
          <span className="font-black tabular-nums">{streak}</span>
        </span>
      ),
    });
  }

  if (calendarEventId || hasNotes || (checklist && checklist.total > 0)) {
    items.push({
      key: 'flags',
      node: (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground/70">
          {calendarEventId && (
            <CalendarDays
              aria-label="From your calendar"
              className={cn(flagSize, 'text-blue-500 dark:text-blue-400')}
            />
          )}
          {hasNotes && (
            <StickyNote aria-label="Has notes" className={flagSize} />
          )}
          {checklist && checklist.total > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 tabular-nums',
                checklist.done === checklist.total && 'text-primary',
              )}
            >
              <ListChecks aria-label="Checklist" className={flagSize} />
              {checklist.done}/{checklist.total}
            </span>
          )}
        </span>
      ),
    });
  }

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold text-muted-foreground',
        compact
          ? 'text-[11.5px] leading-[18px]'
          : 'text-[12px] leading-5 md:text-[13px]',
        className,
      )}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.key}>
          {i > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
          )}
          {item.node}
        </React.Fragment>
      ))}
    </div>
  );
}

export function TaskMetaLine({
  tags,
  startTime,
  endTime,
  isNext = false,
  isDone = false,
  activePhase = null,
  fromCalendar = false,
  focusSeconds = 0,
  className,
}: {
  tags?: TaskMetaTag[];
  startTime?: string;
  endTime?: string;
  isNext?: boolean;
  isDone?: boolean;
  activePhase?: 'focus' | 'break' | null;
  fromCalendar?: boolean;
  focusSeconds?: number;
  className?: string;
}) {
  const parts: { key: string; node: React.ReactNode; fill?: boolean }[] = [];
  const tag = tags?.[0];

  if (tag) {
    const more = (tags?.length ?? 0) - 1;
    parts.push({
      key: 'tag',
      fill: true,
      node: (
        <span className="flex min-w-0 items-center font-medium text-muted-foreground/80">
          <span className="truncate">{tag.name}</span>
          {more > 0 && <span className="ml-1 shrink-0 tabular-nums">+{more}</span>}
        </span>
      ),
    });
  }

  if (activePhase) {
    parts.push({
      key: 'phase',
      node: (
        <span
          className={cn(
            'inline-flex items-center gap-1 font-bold',
            activePhase === 'break' ? 'text-sky-600 dark:text-sky-400' : 'text-primary',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 animate-pulse rounded-full motion-reduce:animate-none',
              activePhase === 'break' ? 'bg-sky-500' : 'bg-primary',
            )}
          />
          {activePhase === 'break' ? 'Break' : 'Focus'}
        </span>
      ),
    });
  } else if (startTime) {
    const highlight = isNext && !isDone;
    parts.push({
      key: 'time',
      node: (
        <span
          className={cn(
            'tabular-nums',
            highlight ? 'font-bold text-primary' : 'font-semibold text-muted-foreground',
          )}
        >
          {endTime && endTime !== startTime ? `${startTime}–${endTime}` : startTime}
        </span>
      ),
    });
  }

  if (fromCalendar) {
    parts.push({
      key: 'calendar',
      node: (
        <CalendarDays
          aria-label="From your calendar"
          className="h-3 w-3 text-blue-500/80 dark:text-blue-400/80"
          strokeWidth={2.5}
        />
      ),
    });
  }

  if (focusSeconds > 0) {
    parts.push({
      key: 'focus',
      node: (
        <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-primary/80">
          <Timer className="h-3 w-3" strokeWidth={2.5} />
          {formatFocusSpan(focusSeconds)}
        </span>
      ),
    });
  }

  if (!parts.length) return null;

  return (
    <span
      className={cn(
        'mt-1 flex min-w-0 items-center gap-1.5 text-[12px] leading-4',
        className,
      )}
    >
      {parts.map((part, i) => (
        <React.Fragment key={part.key}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className="h-[3px] w-[3px] shrink-0 rounded-full bg-muted-foreground/35"
            />
          )}
          <span className={cn('flex items-center', part.fill ? 'min-w-0' : 'shrink-0')}>
            {part.node}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}
