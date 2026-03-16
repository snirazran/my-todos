'use client';
import Fly from '@/components/ui/fly';
import { Repeat, RotateCcw, CalendarDays, Clock } from 'lucide-react';

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
  taskType?: 'weekly' | 'regular' | 'backlog' | 'habit';
  calendarEventId?: string;
  startTime?: string;
  endTime?: string;
  frogodoroSession?: { date: string; completedCycles: number; timeSpent: number; shortBreaks?: number; shortBreakTime?: number; longBreaks?: number; longBreakTime?: number; } | null;
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ left: `${x - dx}px`, top: `${y - dy}px`, width: `${width}px` }}
    >
      <div
        className={[
          'flex items-start gap-3 p-3 select-none rounded-2xl',
          'bg-card border-2 border-primary/20 shadow-2xl backdrop-blur-sm', 
        ].join(' ')}
        style={{
          minHeight: height,
          transform: 'rotate(-2deg) scale(1.05)',
          opacity: 0.95,
        }}
      >
        <span className="shrink-0 h-7 w-7 mt-0.5 relative">
          <Fly size={28} x={-2} y={-2} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col">
          {(tags && tags.length > 0 || startTime) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {startTime && (
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-amber-500 text-white shadow-sm border border-amber-400">
                  <Clock className="w-2.5 h-2.5" />
                  <span>
                    {startTime}
                    {endTime && endTime !== startTime ? ` - ${endTime}` : ''}
                  </span>
                </span>
              )}
              {tags?.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-colors border shadow-sm"
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
          <div className="text-[15px] font-medium leading-[1.4] text-foreground whitespace-pre-wrap break-words">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>{text}</span>
              <div className="inline-flex items-center gap-1.5 shrink-0">
                {taskType === 'weekly' && (
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                {taskType === 'habit' && (
                  <Repeat className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                {calendarEventId && (
                  <CalendarDays className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                )}
              </div>
            </div>
          </div>
          {frogodoroSession && (frogodoroSession.timeSpent > 0 || (frogodoroSession.shortBreaks ?? 0) > 0 || (frogodoroSession.longBreaks ?? 0) > 0) && (() => {
            const fmt = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return s < 60 ? `${s}s` : sec > 0 ? `${m}m ${sec}s` : `${m}m`; };
            return (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {frogodoroSession.timeSpent > 0 && (
                  <div className="inline-flex items-center gap-1 pr-2 py-0.5 rounded-lg bg-primary/8 dark:bg-primary/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span className="text-[11px] font-black text-primary tabular-nums">{frogodoroSession.completedCycles}</span>
                    <span className="text-[10px] font-bold text-primary/60 tabular-nums">{fmt(frogodoroSession.timeSpent)}</span>
                  </div>
                )}
                {(frogodoroSession.shortBreaks ?? 0) > 0 && (
                  <div className="inline-flex items-center gap-1 pr-2 py-0.5 rounded-lg bg-sky-500/8 dark:bg-sky-500/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="text-[11px] font-black text-sky-500 tabular-nums">{frogodoroSession.shortBreaks}</span>
                    <span className="text-[10px] font-bold text-sky-500/60 tabular-nums">{fmt(frogodoroSession.shortBreakTime ?? 0)}</span>
                  </div>
                )}
                {(frogodoroSession.longBreaks ?? 0) > 0 && (
                  <div className="inline-flex items-center gap-1 pr-2 py-0.5 rounded-lg bg-indigo-500/8 dark:bg-indigo-500/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    <span className="text-[11px] font-black text-indigo-500 tabular-nums">{frogodoroSession.longBreaks}</span>
                    <span className="text-[10px] font-bold text-indigo-500/60 tabular-nums">{fmt(frogodoroSession.longBreakTime ?? 0)}</span>
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
