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
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  text: string;
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ left: `${x - dx}px`, top: `${y - dy}px`, width: `${width}px` }}
    >
      <div
        className={[
          'flex items-center gap-3 p-3 select-none rounded-2xl',
          'bg-white/90 backdrop-blur border border-slate-200/80 shadow-2xl', // ← border, not ring
          'shine',
        ].join(' ')}
        style={{
          height,
          transform: 'rotate(-4deg) scale(1.02)',
          opacity: 0.96,
          transition: 'transform 80ms ease-out, opacity 120ms ease-out',
        }}
      >
        <span className="relative grid shrink-0 h-7 w-7 place-items-center">
          <Fly size={22} x={-2} y={-2} className="animate-buzz" />
        </span>
        <span className="flex-1 text-sm text-slate-900 dark:text-slate-50">
          {text}
        </span>
      </div>
    </div>
  );
}
