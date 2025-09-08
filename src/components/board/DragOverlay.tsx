'use client';

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
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${x - dx}px`,
        top: `${y - dy}px`,
        width: `${width}px`,
      }}
    >
      <div
        className={[
          'flex items-center gap-3 p-3 select-none rounded-xl',
          'bg-white/90 dark:bg-slate-700/90',
          'border border-slate-200 dark:border-slate-600',
          'shadow-2xl',
        ].join(' ')}
        style={{
          height,
          transform: 'rotate(-3.5deg) scale(1.02)',
          opacity: 0.92,
          transition: 'transform 80ms ease-out, opacity 120ms ease-out',
        }}
      >
        <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
          {text}
        </span>
      </div>
    </div>
  );
}
