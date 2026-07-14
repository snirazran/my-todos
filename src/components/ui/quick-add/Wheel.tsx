'use client';

import React from 'react';
import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { hapticTick } from '@/lib/haptics';

export type WheelColumnSpec = {
  items: readonly number[];
  value: number;
  onChange: (value: number) => void;
  formatLabel?: (value: number) => string;
};

const optionItem = 'text-[18px] font-bold text-muted-foreground/40';
const highlightItem = 'text-[24px] font-extrabold text-primary';
const maskFill =
  'bg-[color-mix(in_srgb,hsl(var(--primary))_10%,hsl(var(--background)))]';

export function Wheel({
  columns,
  className,
}: {
  columns: WheelColumnSpec[];
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-2xl ring-1 ring-primary/25" />
      <WheelPickerWrapper className="relative z-10 bg-transparent">
        {columns.map((col, i) => {
          const format = col.formatLabel ?? String;
          const options: WheelPickerOption<number>[] = col.items.map((it) => ({
            value: it,
            label: format(it),
          }));
          const round =
            columns.length === 1
              ? 'rounded-2xl'
              : i === 0
                ? 'rounded-l-2xl'
                : i === columns.length - 1
                  ? 'rounded-r-2xl'
                  : '';
          return (
            <WheelPicker
              key={i}
              options={options}
              value={col.value}
              onValueChange={(value) => {
                if (value !== col.value) hapticTick();
                col.onChange(value);
              }}
              optionItemHeight={44}
              visibleCount={12}
              classNames={{
                optionItem,
                highlightItem,
                highlightWrapper: `${maskFill} ${round}`,
              }}
            />
          );
        })}
      </WheelPickerWrapper>
    </div>
  );
}
