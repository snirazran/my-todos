'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';
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
  const isPreset = presets.includes(rounded);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className={compact ? 'flex flex-col items-center gap-2' : 'flex flex-col items-center gap-3'}>
      <div className="relative flex h-[96px] w-[180px] items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {customOpen ? (
            <motion.div
              key="wheel"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="relative"
            >
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
            </motion.div>
          ) : (
            <motion.button
              key="value"
              type="button"
              onClick={() => {
                hapticSelect();
                setCustomOpen(true);
              }}
              aria-label={`${rounded} minutes. Change length`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="flex items-baseline gap-1.5 rounded-2xl px-3 text-white"
            >
              <motion.span
                key={rounded}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                className="text-[52px] font-black leading-none tracking-tighter tabular-nums drop-shadow-lg"
              >
                {rounded}
              </motion.span>
              <span className="text-[16px] font-black text-white/75">min</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {presets.map((preset) => {
          const active = rounded === preset && !customOpen;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => {
                hapticSelect();
                setCustomOpen(false);
                onChange(preset);
              }}
              aria-pressed={active}
              className={`min-h-9 rounded-full px-3.5 text-[13px] font-black transition-[transform,background-color,color] active:scale-95 ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {preset}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            hapticSelect();
            setCustomOpen((v) => !v);
          }}
          aria-pressed={customOpen || !isPreset}
          aria-label="Custom length"
          className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3.5 text-[13px] font-black transition-[transform,background-color,color] active:scale-95 ${
            customOpen || !isPreset
              ? 'bg-white text-slate-900 shadow-sm'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.75} />
          {isPreset ? 'Custom' : rounded}
        </button>
      </div>
    </div>
  );
}

export default DurationDial;
