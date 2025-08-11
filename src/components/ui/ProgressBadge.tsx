'use client';
export default function ProgressBadge({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`text-2xl font-bold ${
          pct >= 80
            ? 'text-green-600'
            : pct >= 50
            ? 'text-yellow-600'
            : 'text-red-600'
        }`}
      >
        {pct}%
      </span>
      <div className="w-32 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full transition-all duration-300 ${
            pct >= 80
              ? 'bg-green-500'
              : pct >= 50
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
