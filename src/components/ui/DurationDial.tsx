'use client';

import { useMemo } from 'react';
import { WheelPicker } from '@/components/ui/WheelPicker';
import { hapticSelect } from '@/lib/haptics';

export interface DurationDialProps {
  minutes: number;
  onChange: (minutes: number) => void;
  presets: number[];
  max?: number;
  min?: number;
  label: string;
  compact?: boolean;
}

export function DurationDial({
  minutes,
  onChange,
  presets,
  max = 180,
  min = 1,
  label,
  compact = false,
}: Readonly<DurationDialProps>) {
  // Fine at the bottom, coarse above it: single minutes are the difference
  // between a 2- and a 3-minute session, but nobody picks 47 over 45 — and a
  // 180-rung dial makes the useful lengths a long scroll away.
  const values = useMemo(() => {
    const list: number[] = [];
    for (let i = Math.max(1, min); i <= Math.min(5, max); i += 1) list.push(i);
    for (let i = 10; i <= max; i += 5) {
      if (i >= min) list.push(i);
    }
    return list.length ? list : [Math.max(1, min)];
  }, [min, max]);

  const rounded = values.reduce(
    (best, entry) =>
      Math.abs(entry - minutes) < Math.abs(best - minutes) ? entry : best,
    values[0],
  );

  return (
    <div className={compact ? 'flex flex-col items-center gap-2' : 'flex flex-col items-center gap-3'}>
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 rounded-xl bg-white/15 ring-1 ring-inset ring-white/25"
          aria-hidden
        />
        <WheelPicker
          values={values}
          value={rounded}
          onChange={onChange}
          label={label}
          visibleItems={3}
          className="w-[132px]"
          selectedClassName="text-[24px] font-black text-white"
          itemClassName="text-[20px] font-black text-white/40"
        />
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 ml-6 -translate-y-1/2 text-[12px] font-black text-white/70"
          aria-hidden
        >
          min
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {presets.map((preset) => {
          const active = rounded === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => {
                hapticSelect();
                onChange(preset);
              }}
              aria-pressed={active}
              className={`min-h-9 rounded-full px-3.5 text-[13px] font-black transition-all active:scale-95 ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DurationDial;
