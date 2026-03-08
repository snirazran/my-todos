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
        </div>
      </div>
    </div>
  );
}
