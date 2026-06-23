'use client';

import React, { useEffect, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';

type Pack = {
  id: string;
  amount: number;
  price: string;
  badge?: string;
};

const PACKS: Pack[] = [
  { id: 'handful', amount: 10, price: '$0.99' },
  { id: 'jar', amount: 50, price: '$3.99', badge: 'Popular' },
  { id: 'crate', amount: 100, price: '$6.99', badge: 'Best Value' },
];

interface CurrencyShopProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
}

export function CurrencyShop({ open, onOpenChange, balance }: CurrencyShopProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const onClose = () => onOpenChange(false);

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      zIndex={999}
      backdropClassName="bg-black/70 backdrop-blur-sm"
      className="max-h-[90vh] bg-popover sm:max-h-[85vh] sm:max-w-2xl"
    >
      {({ bindScroll }) => (
        <>
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-4 pt-2 sm:pt-7">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                    Fly Shop
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Fly size={18} y={-1} />
                    <span className="text-[13px] font-extrabold tabular-nums text-muted-foreground">
                      {balance} flies
                    </span>
                  </div>
                </div>
              </div>

              {/* Packs */}
              <div
                ref={bindScroll}
                className="min-h-0 flex-1 overflow-y-auto overscroll-none px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
              >
                <div className="grid grid-cols-3 gap-2.5 pt-2 sm:gap-4">
                  {PACKS.map((pack) => {
                    const featured = pack.id === 'jar';
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => {}}
                        className={cn(
                          'group relative flex flex-col items-center gap-2.5 rounded-[20px] bg-card p-3 text-center transition-all hover:-translate-y-0.5 active:scale-[0.98] sm:gap-3 sm:rounded-[24px] sm:p-5',
                          featured
                            ? 'ring-2 ring-primary'
                            : 'ring-1 ring-border/70 hover:ring-border',
                        )}
                      >
                        {pack.badge && (
                          <span
                            className={cn(
                              'absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest shadow-sm sm:px-3 sm:py-1 sm:text-[9px]',
                              featured
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-amber-400 text-amber-950',
                            )}
                          >
                            {pack.badge}
                          </span>
                        )}

                        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted/60 sm:h-20 sm:w-20">
                          <Fly size={40} y={-2} />
                        </div>

                        <div className="leading-none">
                          <p className="text-2xl font-black tabular-nums text-foreground sm:text-3xl">
                            {pack.amount}
                          </p>
                          <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground sm:text-[10px]">
                            Flies
                          </p>
                        </div>

                        <span className="mt-0.5 flex h-9 w-full items-center justify-center rounded-xl bg-[#4f9149] text-xs font-black tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all group-hover:-translate-y-0.5 group-hover:shadow-[0_5px_0_0_#34631f] group-active:translate-y-1 group-active:shadow-none sm:h-11 sm:rounded-2xl sm:text-sm">
                          {pack.price}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="mx-auto mt-7 max-w-xs text-center text-[11px] font-medium leading-relaxed text-muted-foreground/70">
                  Purchases support development and keep your frog fed. Thank you! 🐸
                </p>
              </div>
        </>
      )}
    </BaseSheet>
  );
}
