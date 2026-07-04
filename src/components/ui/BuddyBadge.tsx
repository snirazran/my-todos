'use client';

import { Check } from 'lucide-react';
import { useBuddyState } from '@/hooks/useBuddyState';
import type { FrogIndices } from '@/lib/friends/indices';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { cn } from '@/lib/utils';

const FACE_ZOOM = 2.1;
const FACE_CENTER_Y = 0.56;

/**
 * Circular avatar showing just the face of a frog (the partner's equipped
 * look), cropped out of a full FrogSnapshot render.
 */
export function BuddyFrogFace({
  indices,
  size = 24,
  className,
}: {
  indices?: FrogIndices;
  size?: number;
  className?: string;
}) {
  const w = size * FACE_ZOOM;
  const h = (w * 144) / 128;
  return (
    <span
      className={cn(
        'relative block overflow-hidden rounded-full bg-[#4f9149]/10',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute"
        style={{ left: (size - w) / 2, top: size / 2 - h * FACE_CENTER_Y }}
      >
        <FrogSnapshot
          indices={indices}
          width={w}
          height={h}
          visualOffsetY={0}
        />
      </span>
    </span>
  );
}

/**
 * Small circle showing the buddy partner's frog face on a shared task. When
 * `date` is provided and the partner has completed that occurrence, it gets a
 * green ring + check ("your buddy did it too").
 */
export function BuddyBadge({
  taskId,
  date,
  size = 24,
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
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <BuddyFrogFace
        indices={state.partnerIndices}
        size={size}
        className={cn(
          'ring-2 ring-inset',
          partnerDone ? 'ring-[#4f9149]' : 'ring-[#4f9149]/40',
        )}
      />
      {partnerDone && (
        <span
          className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border border-background bg-[#4f9149] text-white"
          style={{ width: size * 0.55, height: size * 0.55 }}
        >
          <Check
            style={{ width: size * 0.36, height: size * 0.36 }}
            strokeWidth={4}
          />
        </span>
      )}
    </span>
  );
}
