'use client';

import React, { useState } from 'react';
import { Snowflake } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useLoginStreak, patchStreakView } from '@/hooks/useLoginStreak';
import { patchInventoryFlies, useInventory } from '@/hooks/useInventory';
import { FreezePurchaseSheet } from './FreezePurchaseSheet';

export function StreakFreezeShopCard() {
  const { view, active } = useLoginStreak(true);
  const { data: inventoryData } = useInventory(true, true);
  const [buyOpen, setBuyOpen] = useState(false);

  if (!active || !view) return null;

  const balance = inventoryData?.wardrobe?.flies ?? 0;
  const atCap = view.freezes >= view.freezeCap;

  return (
    <>
      <button
        type="button"
        onClick={() => setBuyOpen(true)}
        className="flex w-full items-center gap-3 rounded-[20px] border border-sky-300/50 bg-gradient-to-r from-sky-50 to-sky-100 p-3.5 text-left transition-all hover:-translate-y-0.5 active:scale-[0.99] dark:from-sky-500/10 dark:to-sky-500/20 md:p-4"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-500/15">
          <Snowflake className="h-7 w-7 text-sky-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground">Streak Freeze</p>
          <p className="truncate text-xs font-medium text-muted-foreground">
            Protects your daily streak for one missed day · {view.freezes}/
            {view.freezeCap} held
          </p>
        </div>
        <span
          className={cn(
            'flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-xs font-black',
            atCap
              ? 'bg-muted text-muted-foreground'
              : 'bg-sky-500 text-white shadow-[0_3px_0_0_#0369a1]',
          )}
        >
          {atCap ? (
            'Full'
          ) : (
            <>
              <Fly size={16} paused y={-1} />
              {view.freezePriceFlies}
            </>
          )}
        </span>
      </button>

      <FreezePurchaseSheet
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        view={view}
        balance={balance}
        onPurchased={(freezes, flyBalance) => {
          patchStreakView({ ...view, freezes });
          patchInventoryFlies(flyBalance);
        }}
      />
    </>
  );
}
