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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-md ring-1 ring-border/80 shadow">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-2 w-2 rounded-full transition',
              i === activeIndex
                ? 'bg-primary'
                : 'bg-muted-foreground/30',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  );
}
