'use client';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import {
  CalendarDays,
  Clock,
  Bell,
  EllipsisVertical,
  Pen,
  ListChecks,
} from 'lucide-react';

export default function DragOverlay({
  x,
  y,
  dx,
  dy,
  width,
  height,
  text,
  tags,
  taskType,
  calendarEventId,
  startTime,
  endTime,
  reminder,
  notes,
  checklist,
  frogodoroSession,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
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
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ left: `${x - dx}px`, top: `${y - dy}px`, width: `${width}px` }}
    >
      <div
        className={[
          'flex items-center gap-1.5 px-2.5 py-2 select-none rounded-[14px]',
          'bg-card border-2 border-primary/20 shadow-2xl',
        ].join(' ')}
        style={{
          minHeight: height,
          transform: 'rotate(-2deg)',
        }}
      >
        <span
          aria-hidden
          className="-ml-0.5 flex shrink-0 items-center justify-center self-stretch text-muted-foreground/30"
        >
          <EllipsisVertical className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0 flex flex-col">
          {(tags && tags.length > 0 || startTime || reminder) && (
            <div className="mb-1 flex flex-wrap items-center gap-1">
              {startTime && (
                <span className="isolate inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-[4px] text-[10px] leading-[1] font-bold uppercase tracking-normal text-primary shadow-sm">
                  <Clock className="w-2.5 h-2.5 shrink-0" />
                  <span className="leading-[1]">
                    {startTime}
                    {endTime && endTime !== startTime ? ` - ${endTime}` : ''}
                  </span>
                  {reminder && <Bell className="w-2.5 h-2.5 shrink-0 text-amber-500" />}
                </span>
              )}
              {tags?.map((tag) => (
                <span
                  key={tag.id}
                  className="isolate inline-flex items-center gap-1 rounded-md border px-1.5 py-[4px] text-[10px] leading-[1] font-bold uppercase tracking-normal shadow-sm"
                  style={
                    tag.color
                      ? {
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          borderColor: `${tag.color}40`,
                        }
                      : undefined
                  }
                >
                  <span className="relative z-10">{tag.name}</span>
                </span>
              ))}
            </div>
          )}
          <div className="text-sm font-semibold leading-snug text-foreground whitespace-pre-wrap break-words">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="min-w-0 whitespace-pre-wrap break-words">
                {text}
              </span>
              {taskType === 'weekly' && (
                <Icon name="repeat" label="Repeating" className="w-5 h-5 flex-shrink-0" />
              )}
              {calendarEventId && (
                <CalendarDays className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              )}
              {(notes?.trim() || (checklist && checklist.length > 0)) && (
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 no-underline">
                  {notes?.trim() && (
                    <Pen
                      aria-label="Has notes"
                      className="h-4 w-4 text-muted-foreground/70"
                    />
                  )}
                  {checklist &&
                    checklist.length > 0 &&
                    (() => {
                      const done = checklist.filter((c) => c.done).length;
                      const total = checklist.length;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            done === total
                              ? 'text-primary'
                              : 'text-muted-foreground/70'
                          }`}
                        >
                          <ListChecks className="h-4 w-4" />
                          <span className="text-[11px] font-bold tabular-nums no-underline">
                            {done}/{total}
                          </span>
                        </span>
                      );
                    })()}
                </span>
              )}
            </div>
          </div>
          {frogodoroSession && ((frogodoroSession.focusTime ?? 0) > 0 || (frogodoroSession.breakTime ?? 0) > 0) && (() => {
            const fmt = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return s < 60 ? `${s}s` : sec > 0 ? `${m}m ${sec}s` : `${m}m`; };
            return (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {(frogodoroSession.focusTime ?? 0) > 0 && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/8 dark:bg-primary/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Focus</span>
                    <span className="text-[11px] font-black text-primary tabular-nums">{fmt(frogodoroSession.focusTime)}</span>
                  </div>
                )}
                {(frogodoroSession.breakTime ?? 0) > 0 && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/8 dark:bg-sky-500/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-sky-500/60 uppercase tracking-wider">Break</span>
                    <span className="text-[11px] font-black text-sky-500 tabular-nums">{fmt(frogodoroSession.breakTime)}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-muted-foreground/10 bg-muted">
          <span style={{ transform: 'rotate(2deg)' }}>
            <Fly size={36} y={-3} />
          </span>
        </span>
      </div>
    </div>
  );
}
