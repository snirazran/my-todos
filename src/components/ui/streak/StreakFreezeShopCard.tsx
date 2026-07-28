'use client';

import React, { useState } from 'react';
import { Snowflake } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
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

  if (atCap) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        Boosts
      </p>
      <DragScrollRow>
        <button
          type="button"
          onClick={() => setBuyOpen(true)}
          className="relative flex w-[148px] shrink-0 flex-col items-stretch overflow-hidden rounded-xl border-2 border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100 p-2 text-left shadow-sm transition-transform active:scale-[0.97] dark:from-sky-500/10 dark:to-sky-500/20"
        >
          <span className="flex h-24 items-center justify-center rounded-lg bg-background/50">
            <Snowflake className="h-11 w-11 text-sky-500" />
          </span>
          <span className="mt-1.5 truncate text-center text-xs font-black text-foreground">
            Streak Freeze
          </span>
          <span className="truncate text-center text-[10px] font-bold text-muted-foreground">
            {view.freezes}/{view.freezeCap} held
          </span>
          <span className="mt-1 inline-flex items-center justify-center gap-1 text-sm font-black tabular-nums text-foreground">
            <Fly size={26} paused y={-2} />
            {view.freezePriceFlies.toLocaleString()}
          </span>
        </button>
      </DragScrollRow>

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
    </div>
  );
}
