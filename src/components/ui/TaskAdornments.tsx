import { Flame } from 'lucide-react';
import type { ChecklistItem } from '@/lib/checklist';
import { useLeapView } from '@/components/leap/useLeapView';
import { leagueArt } from '@/components/leap/leapCopy';
import { LILY_ART_BOTTOM, LILY_ART_TOP } from '@/components/leap/LeapRail';
import { cn } from '@/lib/utils';

const LILY_MARK_INK = 17;
const FLAME_INK_SHARE = 19 / 24;
const FLAME_BOX = Math.round(LILY_MARK_INK / FLAME_INK_SHARE);

export function LilyInk({
  index,
  ink = LILY_MARK_INK,
  title,
  className,
}: {
  index: number;
  ink?: number;
  title?: string;
  className?: string;
}) {
  const clamped = Math.min(Math.max(0, index), LILY_ART_TOP.length - 1);
  const top = LILY_ART_TOP[clamped];
  const height = ink / (LILY_ART_BOTTOM - top);
  return (
    <span
      title={title}
      aria-hidden="true"
      className={cn(
        'pointer-events-none relative inline-block shrink-0 select-none align-middle',
        className,
      )}
      style={{ height: ink, width: Math.round((ink * 23) / 17) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leagueArt(clamped)}
        alt=""
        draggable={false}
        className="absolute left-1/2 max-w-none -translate-x-1/2"
        style={{ height, width: (height * 500) / 430, top: -top * height }}
      />
    </span>
  );
}

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
        size === 'sm' ? 'text-[14px]' : 'text-[15px]',
        className,
      )}
    >
      <StreakFlame />
      {count}
    </span>
  );
}

export function StreakFlame({ className }: { className?: string }) {
  return (
    <Flame
      aria-hidden="true"
      className={cn('-mx-[3px] shrink-0', className)}
      style={{ width: FLAME_BOX, height: FLAME_BOX }}
      fill="currentColor"
      strokeWidth={0}
    />
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
