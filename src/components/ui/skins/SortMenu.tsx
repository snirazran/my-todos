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
        className="h-12 w-12 rounded-[18px] p-0 border border-border/50 bg-card/50 backdrop-blur-md hover:bg-accent/50 transition-all shadow-sm"
        onClick={() => setOpen(!open)}
      >
        <ArrowUpDown className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
      </Button>
      
      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-[60] w-52 p-2 rounded-2xl border border-border/50 bg-popover/90 backdrop-blur-xl shadow-xl animate-in fade-in zoom-in-95 duration-100">
            {options.map((opt) => (
              <button
                key={opt.val}
                className={cn(
                  "w-full text-left px-4 py-3 text-sm font-bold rounded-xl transition-all",
                  value === opt.val 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
