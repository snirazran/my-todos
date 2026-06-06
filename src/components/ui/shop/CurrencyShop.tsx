'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
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
  const [isDesktop, setIsDesktop] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    setMounted(true);
    const check = () => setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!mounted) return null;

  const onClose = () => onOpenChange(false);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm"
          />

          <div className="pointer-events-none fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              initial={isDesktop ? { opacity: 0, y: 20, scale: 0.98 } : { y: '100%' }}
              animate={isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
              exit={isDesktop ? { opacity: 0, y: 16, scale: 0.98 } : { y: '100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragElastic={{ top: 0, bottom: 0.45 }}
              dragMomentum={false}
              dragSnapToOrigin
              onDragEnd={(_e, { offset, velocity }) => {
                if (!isDesktop && (offset.y > 120 || velocity.y > 650)) onClose();
              }}
              className="pointer-events-auto relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-border/60 bg-popover text-card-foreground shadow-[0_-8px_40px_rgba(15,23,42,0.18)] sm:max-h-[85vh] sm:max-w-2xl sm:rounded-[32px] sm:shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
            >
              {!isDesktop && (
                <div
                  className="absolute inset-x-0 top-0 z-20 h-9"
                  onPointerDown={(e) => dragControls.start(e)}
                />
              )}
              {!isDesktop && (
                <div className="absolute left-1/2 top-3 z-20 h-1.5 w-12 -translate-x-1/2 rounded-full bg-foreground/15" />
              )}

              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-4 pt-8 sm:pt-7">
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
                <button
                  onClick={onClose}
                  type="button"
                  aria-label="Close"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/70 transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <X className="h-5 w-5 stroke-[2.5]" />
                </button>
              </div>

              {/* Packs */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
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
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
