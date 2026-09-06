'use client';

import React from 'react';
import { WheelPicker } from '@/components/ui/WheelPicker';

export type WheelColumnSpec = {
  items: readonly number[];
  value: number;
  onChange: (value: number) => void;
  formatLabel?: (value: number) => string;
  /** Ranges that read as a scale rather than a dial (e.g. "every N weeks"). */
  loop?: boolean;
  label?: string;
};

const ITEM_HEIGHT = 44;
const VISIBLE = 5;

export function Wheel({
  columns,
  className,
}: {
  columns: WheelColumnSpec[];
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-2xl bg-[color-mix(in_srgb,hsl(var(--primary))_10%,hsl(var(--background)))] ring-1 ring-primary/25"
        style={{ height: ITEM_HEIGHT }}
        aria-hidden
      />
      <div className="relative z-10 flex items-stretch justify-center">
        {columns.map((col, i) => (
          <WheelPicker
            key={col.label ?? i}
            values={col.items}
            value={col.value}
            onChange={col.onChange}
            label={col.label ?? `Column ${i + 1}`}
            formatLabel={col.formatLabel}
            itemHeight={ITEM_HEIGHT}
            visibleItems={VISIBLE}
            loop={col.loop ?? true}
            className="flex-1"
            selectedClassName="text-[24px] font-extrabold text-primary"
            itemClassName="text-[18px] font-bold text-muted-foreground/45"
          />
        ))}
      </div>
    </div>
  );
}
