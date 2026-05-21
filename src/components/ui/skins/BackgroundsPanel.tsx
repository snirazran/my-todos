'use client';

import React, { useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  mutateBackgrounds,
  useBackgrounds,
  type BackgroundItem,
} from '@/hooks/useBackgrounds';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { BackgroundCard } from './BackgroundCard';

type Notif = { msg: string; type: 'success' | 'error' };

const rarityRank: Record<BackgroundItem['rarity'], number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export function BackgroundsPanel({
  mode,
  isGuest,
  onNotify,
  shopBalance,
  onSpend,
}: {
  mode: 'inventory' | 'shop';
  isGuest: boolean;
  onNotify?: (n: Notif) => void;
  shopBalance?: number;
  onSpend?: (price: number) => void;
}) {
  const { data, mutate, isLoading } = useBackgrounds(!isGuest);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingBuyId, setConfirmingBuyId] = useState<string | null>(null);

  const balance = shopBalance ?? data?.flies ?? 0;
  const equipped = data?.equipped ?? null;
  const inventory = data?.inventory ?? {};
  const catalog = data?.catalog ?? [];

  const items = useMemo(() => {
    const list = mode === 'inventory'
      ? catalog.filter((b) => (inventory[b.id] ?? 0) > 0)
      : catalog;
    return [...list].sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity]);
  }, [catalog, inventory, mode]);

  const refresh = () => {
    void mutate();
    mutateBackgrounds();
    mutateInventoryCaches();
  };

  const handleEquip = async (item: BackgroundItem) => {
    if (isGuest) {
      onNotify?.({ msg: 'Sign in to use backgrounds!', type: 'error' });
      return;
    }
    const isEquipped = equipped === item.id;
    setBusyId(item.id);
    try {
      const res = await fetch('/api/backgrounds/equip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: isEquipped ? null : item.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to equip');
      }
      onNotify?.({
        msg: isEquipped ? `Unequipped ${item.name}` : `Equipped ${item.name}`,
        type: 'success',
      });
      refresh();
    } catch (err) {
      onNotify?.({
        msg: err instanceof Error ? err.message : 'Failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleBuy = async (item: BackgroundItem, e: React.MouseEvent) => {
    if (isGuest) {
      onNotify?.({ msg: 'Sign in to buy backgrounds!', type: 'error' });
      return;
    }
    const owned = (inventory[item.id] ?? 0) > 0;
    if (owned) {
      // Owned: switch to equip behavior
      void handleEquip(item);
      return;
    }
    if (balance < item.priceFlies) {
      onNotify?.({ msg: 'Not enough flies!', type: 'error' });
      return;
    }
    if (confirmingBuyId !== item.id) {
      setConfirmingBuyId(item.id);
      return;
    }

    setBusyId(item.id);
    setConfirmingBuyId(null);
    try {
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight },
        zIndex: 9999,
        colors: ['#a78bfa', '#4ade80', '#facc15'],
      });

      const res = await fetch('/api/backgrounds/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Purchase failed');
      onSpend?.(item.priceFlies);
      onNotify?.({ msg: `Purchased ${item.name}!`, type: 'success' });
      refresh();
    } catch (err) {
      onNotify?.({
        msg: err instanceof Error ? err.message : 'Purchase failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading && catalog.length === 0) {
    return <BackgroundsSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-50 py-12">
        <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full md:w-24 md:h-24 bg-secondary">
          <ImageIcon className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
        </div>
        <p className="text-lg font-black text-muted-foreground">
          {mode === 'inventory' ? 'No backgrounds owned' : 'No backgrounds available'}
        </p>
        {mode === 'inventory' && (
          <p className="text-xs font-medium text-muted-foreground/70 mt-1">
            Head to the shop to buy one.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-4"
      onClick={() => confirmingBuyId && setConfirmingBuyId(null)}
    >
      {items.map((item) => {
        const owned = (inventory[item.id] ?? 0) > 0;
        const isEquipped = equipped === item.id;
        return (
          <BackgroundCard
            key={item.id}
            item={item}
            owned={owned}
            isEquipped={isEquipped}
            canAfford={balance >= item.priceFlies}
            mode={mode}
            actionLoading={busyId === item.id}
            confirming={confirmingBuyId === item.id}
            onAction={(e) => (mode === 'inventory' ? handleEquip(item) : handleBuy(item, e))}
          />
        );
      })}
    </div>
  );
}

function BackgroundsSkeleton() {
  return (
    <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="mx-auto flex w-full max-w-[240px] flex-col rounded-2xl border-[3px] border-border bg-card p-2.5 md:p-3.5"
        >
          <div className="mt-4 mb-2 md:mt-5 md:mb-3 aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl bg-muted/50" />
          <div className="mx-auto h-3 w-2/3 rounded-full bg-muted/60" />
          <div className="mx-auto mt-3 h-7 w-3/4 rounded-lg bg-muted/50 md:h-8" />
        </div>
      ))}
    </div>
  );
}
