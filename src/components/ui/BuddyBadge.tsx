'use client';

import { Check, Clock } from 'lucide-react';
import { useBuddyBonusFlies, useBuddyState } from '@/hooks/useBuddyState';
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
        'relative block overflow-hidden rounded-full bg-[#447d3f]/10',
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
  variant = 'avatar',
  className,
}: {
  taskId: string;
  date?: string;
  size?: number;
  variant?: 'avatar' | 'chip';
  className?: string;
}) {
  const byTaskId = useBuddyState();
  const state = byTaskId[taskId];
  if (!state) return null;

  if (variant === 'chip') {
    const pending = state.status === 'pending';
    const done =
      !pending &&
      (state.oneTime
        ? state.partnerCompletedDates.length > 0
        : !!date && state.partnerCompletedDates.includes(date));
    const firstName = state.partnerName?.trim().split(/\s+/)[0] || 'Buddy';
    return (
      <span
        title={
          pending
            ? `Waiting for ${state.partnerName} to accept`
            : done
              ? `${state.partnerName} completed this`
              : `Shared with ${state.partnerName}`
        }
        className={cn(
          'inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12.5px] font-black',
          pending
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : done
              ? 'bg-[#447d3f]/15 text-[#3d7a38] dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          className,
        )}
      >
        <BuddyFrogFace
          indices={state.partnerIndices}
          size={24}
          className="shrink-0 ring-1 ring-inset ring-black/5"
        />
        <span className="truncate">{firstName}</span>
        {pending ? (
          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
        ) : done ? (
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
        ) : null}
      </span>
    );
  }

  if (state.status === 'pending') {
    return (
      <span
        title={`Waiting for ${state.partnerName} to accept`}
        className={cn('relative inline-flex shrink-0', className)}
        style={{ width: size, height: size }}
      >
        <BuddyFrogFace
          indices={state.partnerIndices}
          size={size}
          className="opacity-70 ring-2 ring-inset ring-amber-500/50"
        />
        <span
          className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border border-background bg-amber-500 text-white"
          style={{ width: size * 0.55, height: size * 0.55 }}
        >
          <Clock
            style={{ width: size * 0.36, height: size * 0.36 }}
            strokeWidth={3}
          />
        </span>
      </span>
    );
  }

  const partnerDone = state.oneTime
    ? state.partnerCompletedDates.length > 0
    : !!date && state.partnerCompletedDates.includes(date);

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
          partnerDone ? 'ring-[#447d3f]' : 'ring-[#447d3f]/40',
        )}
      />
      {partnerDone && (
        <span
          className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border border-background bg-[#447d3f] text-white"
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

export function BuddyLine({
  taskId,
  date,
  isDone = false,
  className,
}: {
  taskId: string;
  date?: string;
  isDone?: boolean;
  className?: string;
}) {
  const byTaskId = useBuddyState();
  const bonusFlies = useBuddyBonusFlies();
  const state = byTaskId[taskId];
  if (!state) return null;

  const firstName = state.partnerName?.trim().split(/\s+/)[0] || 'your buddy';
  const pending = state.status === 'pending';
  const partnerDone =
    !pending &&
    (state.oneTime
      ? state.partnerCompletedDates.length > 0
      : !!date && state.partnerCompletedDates.includes(date));

  const tone = pending
    ? 'text-amber-600 dark:text-amber-400'
    : partnerDone
      ? 'text-[#3d7a38] dark:text-emerald-400'
      : 'text-muted-foreground';

  const message = pending ? (
    <>Waiting for {firstName} to join</>
  ) : partnerDone && isDone ? (
    <>You both finished · +{bonusFlies} each</>
  ) : partnerDone ? (
    <>
      <b className="font-black">{firstName}</b> finished · your turn
    </>
  ) : isDone ? (
    <>Waiting on {firstName}</>
  ) : (
    <>
      With <b className="font-black text-foreground/80">{firstName}</b> · +
      {bonusFlies} each
    </>
  );

  return (
    <span className={cn('flex h-7 min-w-0 items-center gap-2', className)}>
      <span className="relative shrink-0">
        <BuddyFrogFace
          indices={state.partnerIndices}
          size={22}
          className={cn(
            'ring-2',
            pending
              ? 'opacity-70 ring-amber-400/60'
              : partnerDone
                ? 'ring-[#447d3f]'
                : 'ring-border',
          )}
        />
        {(pending || partnerDone) && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-1 grid h-3 w-3 place-items-center rounded-full text-white ring-2 ring-card',
              pending ? 'bg-amber-500' : 'bg-[#447d3f]',
            )}
          >
            {pending ? (
              <Clock className="h-2 w-2" strokeWidth={3.5} />
            ) : (
              <Check className="h-2 w-2" strokeWidth={4} />
            )}
          </span>
        )}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-[12.5px] font-semibold md:text-[13px]',
          tone,
        )}
      >
        {message}
      </span>
    </span>
  );
}
