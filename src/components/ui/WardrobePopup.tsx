'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Clock } from 'lucide-react';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { byId as staticById, TRADE_ITEM_COUNT } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';

export type WardrobeTab = 'inventory' | 'shop' | 'trade';

export function useWardrobeBadges() {
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount, data } = useInventory(
    !!user,
    true,
  );
  const inventoryBadge = unseenCount + unseenContainerCount;
  const flyBalance = data?.wardrobe?.flies;
  const dealEndsAt = data?.dailyDeals?.[0]?.endsAt ?? null;

  const tradeSpares = useMemo(() => {
    const inv = data?.wardrobe?.inventory ?? {};
    const catalogById: Record<string, { slot?: string }> = {};
    for (const item of data?.catalog ?? []) catalogById[item.id] = item;
    let spares = 0;
    for (const [id, count] of Object.entries(inv)) {
      if ((count ?? 0) <= 1) continue;
      const def = catalogById[id] ?? staticById[id];
      if (def?.slot === 'container') continue;
      spares += count - 1;
    }
    return spares;
  }, [data]);

  return { inventoryBadge, flyBalance, tradeSpares, dealEndsAt };
}

const SHEET_ENTER = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 38,
  mass: 0.9,
};
const SHEET_EXIT = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1] as [number, number, number, number],
};

export function WardrobePopup({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (tab: WardrobeTab) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { inventoryBadge, flyBalance, tradeSpares, dealEndsAt } =
    useWardrobeBadges();
  const dealCountdown = useCountdown(
    open && dealEndsAt ? dealEndsAt : undefined,
  );
  useRegisterOpenSheet(open);
  if (!mounted) return null;

  const tradeReady = tradeSpares >= TRADE_ITEM_COUNT;

  const pick = (tab: WardrobeTab) => {
    hapticTick();
    onSelect(tab);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 z-[98] bg-black/60 backdrop-blur-[2px] md:hidden"
          />

          <motion.div
            initial={{ y: '112%' }}
            animate={{ y: 0 }}
            exit={{ y: '112%', transition: SHEET_EXIT }}
            transition={SHEET_ENTER}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
            className="fixed left-0 right-0 z-[99] md:hidden"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
          >
            <div className="rounded-t-[28px] border-t border-border/60 bg-background pb-5 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
              <div className="relative px-5 pb-3 pt-1 text-center">
                <p className="text-[10px] font-black uppercase leading-none tracking-widest text-muted-foreground">
                  Dress your frog
                </p>
                <h2 className="mt-1 text-xl font-black leading-none text-foreground">
                  Wardrobe
                </h2>
                {typeof flyBalance === 'number' && (
                  <div className="absolute right-4 top-1 flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 shadow-sm">
                    <img src="/fly.svg" alt="" className="h-4 w-4" />
                    <span className="text-[12px] font-black tabular-nums text-foreground">
                      {flyBalance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3 px-4">
                <button
                  type="button"
                  onClick={() => pick('inventory')}
                  className="relative flex w-full items-center gap-3.5 rounded-2xl border border-border/50 bg-card p-3.5 text-left shadow-sm transition-transform active:scale-[0.98]"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon
                      name="wardrobe"
                      label="Inventory"
                      className="h-9 w-9"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-black leading-tight text-foreground">
                      Inventory
                    </p>
                    <p className="mt-0.5 text-xs font-semibold leading-snug text-muted-foreground">
                      Outfits, backgrounds & gifts you own
                    </p>
                  </div>
                  {inventoryBadge > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white shadow-sm">
                      {inventoryBadge > 9 ? '9+' : inventoryBadge}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pick('shop')}
                    className="relative flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-4 shadow-sm transition-transform active:scale-[0.97]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 p-2.5">
                      <img src="/fly.svg" alt="" className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black leading-tight text-foreground">
                        Shop
                      </p>
                      {dealCountdown ? (
                        <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-black text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          Deal ends
                          <span className="tabular-nums">{dealCountdown}</span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                          Fresh looks daily
                        </p>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => pick('trade')}
                    className="relative flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-4 shadow-sm transition-transform active:scale-[0.97]"
                  >
                    {tradeReady && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background bg-amber-500 px-1.5 text-[11px] font-black text-white shadow-sm">
                        {tradeSpares > 9 ? '9+' : tradeSpares}
                      </span>
                    )}
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 p-2">
                      <Icon name="repeat" label="Trade" className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black leading-tight text-foreground">
                        Trade
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                        {TRADE_ITEM_COUNT} spares → upgrade
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
