'use client';

import { Check } from 'lucide-react';
import { useBuddyState } from '@/hooks/useBuddyState';
import { cn } from '@/lib/utils';

/**
 * Small circle showing the buddy partner's initial on a shared task. When
 * `date` is provided and the partner has completed that occurrence, it turns
 * green with a check ("your buddy did it too").
 */
export function BuddyBadge({
  taskId,
  date,
  size = 20,
  className,
}: {
  taskId: string;
  date?: string;
  size?: number;
  className?: string;
}) {
  const byTaskId = useBuddyState();
  const state = byTaskId[taskId];
  if (!state) return null;

  const partnerDone = !!date && state.partnerCompletedDates.includes(date);

  return (
    <span
      title={
        partnerDone
          ? `${state.partnerName} completed this`
          : `Shared with ${state.partnerName}`
      }
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black leading-none',
        partnerDone
          ? 'border-[#4f9149] bg-[#4f9149] text-white'
          : 'border-[#4f9149]/40 bg-[#4f9149]/10 text-[#4f9149]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {partnerDone ? (
        <Check style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={3.5} />
      ) : (
        state.partnerInitial
      )}
    </span>
  );
}
