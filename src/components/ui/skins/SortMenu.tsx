'use client';

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortOrder =
  | 'featured'
  | 'latest'
  | 'rarity_asc'
  | 'rarity_desc'
  | 'price_asc'
  | 'price_desc';

export function SortMenu({
  value,
  onChange,
  showLatest = true,
  showFeatured = false,
}: {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
  showLatest?: boolean;
  showFeatured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const options: { label: string; val: SortOrder }[] = [
    ...(showFeatured ? [{ label: 'Featured', val: 'featured' as SortOrder }] : []),
    ...(showLatest ? [{ label: 'Recently Added', val: 'latest' as SortOrder }] : []),
    { label: 'Rarity: Low to High', val: 'rarity_asc' },
    { label: 'Rarity: High to Low', val: 'rarity_desc' },
    { label: 'Price: Low to High', val: 'price_asc' },
    { label: 'Price: High to Low', val: 'price_desc' },
  ];

  return (
    <>
      <Button
        ref={triggerRef as any}
        variant="outline"
        className="h-12 w-12 rounded-[18px] p-0 border border-border/50 bg-card/50 backdrop-blur-md hover:bg-accent/50 transition-all shadow-sm"
        onClick={() => setOpen(!open)}
      >
        <ArrowUpDown className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
      </Button>

      {mounted && open && pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[1001] w-52 p-2 rounded-2xl border border-border/50 bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{ top: pos.top, right: pos.right }}
            >
              {options.map((opt) => (
                <button
                  key={opt.val}
                  className={cn(
                    'w-full text-left px-4 py-3 text-sm font-bold rounded-xl transition-all',
                    value === opt.val
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
          </>,
          document.body,
        )}
    </>
  );
}
