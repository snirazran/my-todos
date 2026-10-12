import { Flame } from 'lucide-react';
import type { ChecklistItem } from '@/lib/checklist';

export function StreakPill({
  count,
  size = 'md',
}: {
  count: number;
  size?: 'md' | 'sm';
}) {
  return (
    <span
      aria-label={`${count} in a row`}
      title={`${count} in a row`}
      className={`inline-flex shrink-0 items-center gap-0.5 font-black tabular-nums leading-none text-orange-500 dark:text-orange-400 ${
        size === 'sm' ? 'text-[13px]' : 'text-[14px]'
      }`}
    >
      <Flame
        className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'}
        fill="currentColor"
        strokeWidth={0}
      />
      {count}
    </span>
  );
}

export function StepPips({ items, done }: { items: ChecklistItem[]; done: number }) {
  const total = items.length;
  if (total > 8) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-foreground/[0.12]">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </span>
        <span className="text-[11px] font-bold tabular-nums text-muted-foreground/70">
          {done}/{total}
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-[3px]">
      {items.map((item, i) => (
        <span
          key={item.id}
          className={`h-1.5 w-3 rounded-full transition-colors duration-300 ${
            i < done
              ? 'bg-primary'
              : item.reward
                ? 'bg-amber-300 dark:bg-amber-400/60'
                : 'bg-foreground/[0.12]'
          }`}
        />
      ))}
    </span>
  );
}

export function formatFocusSpan(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.max(1, Math.round(seconds))}s`;
  if (minutes < 60) return `${minutes}m`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${minutes / 60}h`;
}
