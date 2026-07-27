import React from 'react';

/**
 * How many flies this task holds, riding on the corner of its fly. A checklist
 * only ever pays for the steps that are ticked, so the count is a live tally —
 * a filled badge must never claim flies that haven't been caught yet.
 */
export function FlyValueBadge({
  value,
  caught,
  size = 'md',
}: {
  value: number;
  /** Flies caught so far. Omit for tasks that pay in one go. */
  caught?: number;
  size?: 'sm' | 'md';
}) {
  if (value <= 1) return null;
  const sm = size === 'sm';
  const counting = typeof caught === 'number';
  const complete = !counting || caught >= value;
  return (
    <span
      aria-label={
        counting ? `${caught} of ${value} flies caught` : `Holds ${value} flies`
      }
      className={`pointer-events-none absolute -right-1 -top-1 grid place-items-center rounded-full font-black leading-none tabular-nums ring-2 ring-card shadow-[0_1px_3px_rgba(0,0,0,0.22)] transition-colors ${
        complete
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted-foreground/70 text-background'
      } ${
        sm
          ? 'h-[17px] min-w-[17px] px-1 text-[10px]'
          : 'h-[19px] min-w-[19px] px-1 text-[11px]'
      }`}
    >
      {counting && !complete ? `${caught}/${value}` : value}
    </span>
  );
}

export default FlyValueBadge;
