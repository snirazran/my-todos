import { Bell, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'px-1.5 py-0.5 text-[9px] md:text-[11px]',
  md: 'px-1.5 py-[4px] text-[10px] leading-[1]',
} as const;

export function TimeTag({
  startTime,
  endTime,
  reminder,
  size = 'sm',
  className,
}: {
  startTime: string;
  endTime?: string;
  reminder?: string | boolean | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (!startTime) return null;

  const hasReminder = !!reminder;
  const Icon = hasReminder ? Bell : Clock;
  const label =
    endTime && endTime !== startTime
      ? `${startTime}–${endTime}`
      : startTime;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 font-bold uppercase tracking-normal text-primary shadow-sm',
        SIZES[size],
        className,
      )}
    >
      <Icon
        className={cn(
          'h-2.5 w-2.5 shrink-0',
          hasReminder && 'text-amber-500',
        )}
      />
      <span className="leading-[1] tabular-nums">{label}</span>
    </span>
  );
}
