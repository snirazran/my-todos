'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortOrder = 'rarity_asc' | 'rarity_desc' | 'price_asc' | 'price_desc';

export function SortMenu({ value, onChange }: { value: SortOrder; onChange: (v: SortOrder) => void }) {
  const [open, setOpen] = useState(false);

  const options: { label: string; val: SortOrder }[] = [
    { label: 'Rarity: High to Low', val: 'rarity_desc' },
    { label: 'Rarity: Low to High', val: 'rarity_asc' },
    { label: 'Price: High to Low', val: 'price_desc' },
    { label: 'Price: Low to High', val: 'price_asc' },
  ];

  return (
    <div className="relative">
      <Button 
        variant="outline" 
        className="h-12 w-12 rounded-2xl p-0 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-slate-700 transition-all shadow-sm"
        onClick={() => setOpen(!open)}
      >
        <ArrowUpDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
      </Button>
      
      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-[60] w-52 p-2 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-100">
            {options.map((opt) => (
              <button
                key={opt.val}
                className={cn(
                  "w-full text-left px-4 py-3 text-sm font-bold rounded-xl transition-all",
                  value === opt.val 
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" 
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
                onClick={() => {
                  onChange(opt.val);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
