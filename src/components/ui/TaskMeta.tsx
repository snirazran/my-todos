import React from 'react';
import {
  Bell,
  CalendarDays,
  Clock,
  Flame,
  ListChecks,
  StickyNote,
} from 'lucide-react';
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
