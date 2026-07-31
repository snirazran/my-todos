import React from 'react';

/**
 * How many flies this task pays right now, riding on the corner of its fly. It
 * climbs as checklist markers are passed, so it only ever shows flies that are
 * already secured; a plain one-fly task carries no badge at all.
 */
export function FlyValueBadge({
  value,
  size = 'md',
}: {
  value: number;
  size?: 'sm' | 'md';
}) {
  if (value <= 1) return null;
  const sm = size === 'sm';
  return (
    <span
      aria-label={`Pays ${value} flies`}
      className={`pointer-events-none absolute -right-1 -top-1 grid place-items-center rounded-full bg-primary font-black leading-none tabular-nums text-primary-foreground ring-2 ring-card shadow-[0_1px_3px_rgba(0,0,0,0.22)] ${
        sm
          ? 'h-[17px] min-w-[17px] px-1 text-[10px]'
          : 'h-[19px] min-w-[19px] px-1 text-[11px]'
      }`}
    >
      {value}
    </span>
  );
}

export default FlyValueBadge;
