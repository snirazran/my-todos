'use client';
import Fly from '@/components/ui/fly';
import { RotateCcw, CalendarDays, Clock, Bell } from 'lucide-react';

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
  frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ left: `${x - dx}px`, top: `${y - dy}px`, width: `${width}px` }}
    >
      <div
        className={[
          'flex items-center gap-2 px-2 py-2 select-none rounded-[14px]',
          'bg-card border-2 border-primary/20 shadow-2xl backdrop-blur-sm',
        ].join(' ')}
        style={{
          minHeight: height,
          transform: 'rotate(-2deg) scale(1.05)',
          opacity: 0.95,
        }}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60">
          <Fly size={32} y={-3} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col">
          {(tags && tags.length > 0 || startTime || reminder) && (
            <div className="mb-1 flex flex-wrap items-center gap-1">
              {startTime && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-normal uppercase bg-amber-500 text-white shadow-sm border border-amber-400">
                  <Clock className="w-2.5 h-2.5" />
                  <span>
                    {startTime}
                    {endTime && endTime !== startTime ? ` - ${endTime}` : ''}
                  </span>
                  {reminder && <Bell className="w-2.5 h-2.5" />}
                </span>
              )}
              {tags?.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-normal uppercase transition-colors border shadow-sm"
                  style={
                    tag.color
                      ? {
                          backgroundColor: tag.color,
                          color: 'white',
                          borderColor: 'rgba(255,255,255,0.2)',
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
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {text}
              </span>
              <div className="inline-flex items-center gap-1.5 shrink-0">
                {taskType === 'weekly' && (
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                {calendarEventId && (
                  <CalendarDays className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                )}
              </div>
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
      </div>
    </div>
  );
}
