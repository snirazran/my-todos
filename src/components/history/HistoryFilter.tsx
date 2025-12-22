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
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-full sm:w-auto overflow-x-auto no-scrollbar">
      {options.map((opt) => {
        const isActive = value === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap z-10 flex items-center gap-2",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeFilter"
                className="absolute inset-0 bg-background shadow-sm rounded-md -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            {Icon && <Icon className="w-4 h-4" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}