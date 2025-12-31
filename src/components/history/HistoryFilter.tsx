'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon } from 'lucide-react';

export type DateRangeOption = '7d' | '30d' | 'custom';

type HistoryFilterProps = {
  value: DateRangeOption;
  onChange: (val: DateRangeOption) => void;
};

export default function HistoryFilter({ value, onChange }: HistoryFilterProps) {
  const options: { id: DateRangeOption; label: string; icon?: React.ElementType }[] = [
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'custom', label: 'Custom', icon: CalendarIcon },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 p-1 bg-card/80 backdrop-blur-2xl border border-border/50 rounded-[14px] w-full sm:flex sm:items-center sm:w-auto overflow-hidden">
      {options.map((opt) => {
        const isActive = value === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative px-3 py-2 text-[11px] font-black uppercase tracking-wider rounded-[10px] transition-all whitespace-nowrap z-10 flex items-center justify-center gap-1.5",
              isActive ? "text-primary shadow-sm" : "text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeFilter"
                className="absolute inset-0 bg-background rounded-[10px] -z-10"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}