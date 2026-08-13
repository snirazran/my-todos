'use client';

import React, { useState } from 'react';
import { ShieldCheck, Snowflake } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { useLoginStreak, patchStreakView } from '@/hooks/useLoginStreak';
import { patchInventoryFlies, useInventory } from '@/hooks/useInventory';
import { usePactView } from '@/components/pact/PactCard';
import { PactShieldSheet } from '@/components/pact/PactShieldSheet';
import { FreezePurchaseSheet } from './FreezePurchaseSheet';

/**
 * The shop's non-cosmetic shelf: the two things flies buy that protect
 * progress instead of decorating the frog. Each tile hides itself when its
 * stock is full, and the whole row disappears when neither has anything to
 * sell — an empty "Boosts" heading reads as something broken.
 */
function BoostTile({
  icon,
  name,
  held,
  cap,
  price,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  held: number;
  cap: number;
  price: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-[148px] shrink-0 flex-col items-stretch overflow-hidden rounded-xl border-2 border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100 p-2 text-left shadow-sm transition-transform active:scale-[0.97] dark:from-sky-500/10 dark:to-sky-500/20"
    >
      <span className="flex h-24 items-center justify-center rounded-lg bg-background/50">
        {icon}
      </span>
      <span className="mt-1.5 truncate text-center text-xs font-black text-foreground">
        {name}
      </span>
      <span className="truncate text-center text-[10px] font-bold text-muted-foreground">
        {held}/{cap} held
      </span>
      <span className="mt-1 inline-flex items-center justify-center gap-1 text-sm font-black tabular-nums text-foreground">
        <Fly size={26} paused y={-2} />
        {price.toLocaleString()}
      </span>
    </button>
  );
}

export function StreakFreezeShopCard() {
  const { view, active } = useLoginStreak(true);
  const { data: inventoryData } = useInventory(true, true);
  const { data: pact } = usePactView();
  const [buyOpen, setBuyOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);

  const balance = inventoryData?.wardrobe?.flies ?? 0;

  const showFreeze = !!active && !!view && view.freezes < view.freezeCap;
  const showShield =
    !!pact?.enabled &&
    !pact.needsAreas &&
    pact.streak.shields < pact.streak.shieldCap;

  if (!showFreeze && !showShield) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        Streak savers
      </p>
      <DragScrollRow>
        {showFreeze && view && (
          <BoostTile
            icon={<Snowflake className="h-11 w-11 text-sky-500" />}
            name="Streak Freeze"
            held={view.freezes}
            cap={view.freezeCap}
            price={view.freezePriceFlies}
            onClick={() => setBuyOpen(true)}
          />
        )}
        {showShield && pact && (
          <BoostTile
            icon={<ShieldCheck className="h-11 w-11 text-sky-500" />}
            name="Streak Shield"
            held={pact.streak.shields}
            cap={pact.streak.shieldCap}
            price={pact.streak.shieldPriceFlies}
            onClick={() => setShieldOpen(true)}
          />
        )}
      </DragScrollRow>

      {view && (
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
      )}

      {pact && (
        <PactShieldSheet
          open={shieldOpen}
          onClose={() => setShieldOpen(false)}
          view={pact}
          onChanged={(_next, flyBalance) => patchInventoryFlies(flyBalance)}
        />
      )}
    </div>
  );
}
