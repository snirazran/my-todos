'use client';

export default function PaginationDots({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  return (
    <div
      className="fixed left-0 right-0 z-30 flex justify-center md:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm shadow">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full ${
              i === activeIndex ? 'bg-violet-600' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
