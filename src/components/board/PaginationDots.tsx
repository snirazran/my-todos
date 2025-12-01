'use client';

export default function PaginationDots({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  return (
    <div className="flex justify-center md:hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md ring-1 ring-slate-200/80 shadow dark:bg-slate-900/70 dark:ring-slate-700/60">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-2 w-2 rounded-full transition',
              i === activeIndex
                ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                : 'bg-slate-300/80',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  );
}
