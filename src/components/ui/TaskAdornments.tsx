import { Flame } from 'lucide-react';
import type { ChecklistItem } from '@/lib/checklist';
import { useLeapView } from '@/components/leap/useLeapView';
import { leagueArt } from '@/components/leap/leapCopy';
import { LILY_ART_BOTTOM, LILY_ART_TOP } from '@/components/leap/LeapRail';
import { cn } from '@/lib/utils';

const LILY_MARK_INK = 17;

export function LeapStageMark({ className }: { className?: string }) {
  const { data } = useLeapView();
  if (!data?.enabled) return null;
  const index = Math.min(Math.max(0, data.league), LILY_ART_TOP.length - 1);
  const top = LILY_ART_TOP[index];
  const height = LILY_MARK_INK / (LILY_ART_BOTTOM - top);
  const label = data.leagues[data.league]?.label;
  return (
    <span
      title={label ? `Counts toward ${label}` : undefined}
      aria-hidden="true"
      className={cn(
        'pointer-events-none relative inline-block h-[17px] w-[23px] shrink-0 select-none align-middle',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leagueArt(index)}
        alt=""
        draggable={false}
        className="absolute left-1/2 max-w-none -translate-x-1/2"
        style={{ height, width: (height * 500) / 430, top: -top * height }}
      />
    </span>
  );
}

export function StreakPill({
  count,
  size = 'md',
  className,
}: {
  count: number;
  size?: 'md' | 'sm';
  className?: string;
}) {
  return (
    <span
      aria-label={`${count} in a row`}
      title={`${count} in a row`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 font-black tabular-nums leading-none text-orange-500 dark:text-orange-400',
        size === 'sm' ? 'text-[13px]' : 'text-[14px]',
        className,
      )}
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
