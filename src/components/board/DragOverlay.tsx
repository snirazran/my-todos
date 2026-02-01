'use client';
import Fly from '@/components/ui/fly';

export default function DragOverlay({
  x,
  y,
  dx,
  dy,
  width,
  height,
  text,
  tags,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  text: string;
  tags?: { id: string; name: string; color: string }[];
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ left: `${x - dx}px`, top: `${y - dy}px`, width: `${width}px` }}
    >
      <div
        className={[
          'flex items-center gap-3 p-3 select-none rounded-2xl',
          'bg-card border border-border/80 shadow-2xl', 
        ].join(' ')}
        style={{
          minHeight: height,
          transform: 'rotate(-4deg) scale(1.02)',
          opacity: 1,
          transition: 'transform 80ms ease-out, opacity 120ms ease-out',
        }}
      >
        <span className="relative grid shrink-0 h-7 w-7 place-items-center">
          <Fly size={22} x={-2} y={-2} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {tags && tags.length > 0 && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-colors border shadow-sm"
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
                  {!tag.color && (
                    <span className="absolute inset-0 w-full h-full border rounded-md opacity-10 bg-indigo-50 text-indigo-700 border-indigo-100 pointer-events-none" />
                  )}
                  <span className={!tag.color ? "text-indigo-600 relative z-10" : ""}>{tag.name}</span>
                </span>
              ))}
            </div>
          )}
          <span className="text-[15px] font-medium leading-snug text-foreground whitespace-pre-wrap break-words">
            {text}
          </span>
        </div>
      </div>
    </div>
  );
}
