'use client';

import React from 'react';
import { Sparkles, Crown, Shirt, Hand, Ghost, Ribbon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterCategory = 'all' | 'hat' | 'scarf' | 'body' | 'held' | 'costume';

const CATEGORY_CONFIG: Record<FilterCategory, { label: string; icon: React.ReactNode }> = {
  all: { label: 'All Items', icon: <Sparkles className="w-5 h-5" /> },
  hat: { label: 'Hats', icon: <Crown className="w-5 h-5" /> },
  scarf: { label: 'Scarves', icon: <Ribbon className="w-5 h-5" /> }, // Ribbon works better for scarf visually
  body: { label: 'Body', icon: <Shirt className="w-5 h-5" /> }, // Shirt works for body/skin
  held: { label: 'Held', icon: <Hand className="w-5 h-5" /> },
  costume: { label: 'Costumes', icon: <Ghost className="w-5 h-5" /> },
};

export function FilterBar({ 
  active, 
  onChange 
}: { 
  active: FilterCategory; 
  onChange: (s: FilterCategory) => void; 
}) {
  const categories: FilterCategory[] = ['all', 'hat', 'scarf', 'body', 'held', 'costume'];

  return (
    <div className="w-full flex items-center gap-3 px-6 pb-4 overflow-x-auto relative z-30 touch-pan-x">
      {categories.map(cat => {
        const conf = CATEGORY_CONFIG[cat];
        const isActive = active === cat;
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={cn(
              "flex shrink-0 items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border-[2px] shadow-sm",
              isActive
                ? "bg-purple-600 border-purple-600 text-white shadow-purple-500/30 scale-105"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-300"
            )}
          >
            {conf.icon}
            {conf.label}
          </button>
        );
      })}
    </div>
  );
}
