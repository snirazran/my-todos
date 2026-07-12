'use client';

import React, { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  mutateBackgrounds,
  useBackgrounds,
  type BackgroundItem,
} from '@/hooks/useBackgrounds';
import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
} from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';

type Notif = { msg: string; type: 'success' | 'error' };

const rarityRank: Record<BackgroundItem['rarity'], number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export type BackgroundSortOrder =
  | 'featured'
  | 'latest'
  | 'rarity_asc'
  | 'rarity_desc'
  | 'price_asc'
  | 'price_desc';

export function backgroundPreview(item: BackgroundItem) {
  return (
    item.images.mobile ||
    item.images.tablet ||
    item.images.web ||
    item.images.webLarge ||
    ''
  );
}

export function useBackgroundActions({
  isGuest,
  onNotify,
  shopBalance,
  onSpend,
}: {
  isGuest: boolean;
  onNotify?: (n: Notif) => void;
  shopBalance?: number;
  onSpend?: (price: number) => void;
}) {
  const { data, mutate, isLoading } = useBackgrounds(!isGuest);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingBuyId, setConfirmingBuyId] = useState<string | null>(null);
  const [sellTarget, setSellTarget] = useState<BackgroundItem | null>(null);

  const balance = shopBalance ?? data?.flies ?? 0;
  const equipped = data?.equipped ?? null;
  const inventory = useMemo(() => data?.inventory ?? {}, [data?.inventory]);
  const catalog = useMemo(() => data?.catalog ?? [], [data?.catalog]);

  const refresh = () => {
    void mutate();
    mutateBackgrounds();
    mutateInventoryCaches();
  };

  const sortItems = (
    mode: 'inventory' | 'shop',
    sortBy: BackgroundSortOrder,
  ) => {
    const list =
      mode === 'inventory'
        ? catalog.filter((b) => (inventory[b.id] ?? 0) > 0)
        : catalog;
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'rarity_asc':
          return rarityRank[a.rarity] - rarityRank[b.rarity];
        case 'price_asc':
          return (a.priceFlies ?? 0) - (b.priceFlies ?? 0);
        case 'price_desc':
          return (b.priceFlies ?? 0) - (a.priceFlies ?? 0);
        default:
          return rarityRank[b.rarity] - rarityRank[a.rarity];
      }
    });
  };

  const handleEquip = async (item: BackgroundItem) => {
    if (isGuest) {
      onNotify?.({ msg: 'Sign in to use backgrounds!', type: 'error' });
      return;
    }
    if (equipped === item.id) return;
    try {
      navigator.vibrate?.(14);
    } catch {}
    if (data) {
      const nextData = { ...data, equipped: item.id };
      void mutate(nextData, { revalidate: false });
      mutateBackgrounds(nextData);
    }
    beginEquipMutation();
    try {
      const res = await fetch('/api/backgrounds/equip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to equip');
      }
    } catch (err) {
      onNotify?.({ msg: err instanceof Error ? err.message : 'Failed', type: 'error' });
      refresh();
    } finally {
      endEquipMutation();
    }
  };

  const handleBuy = async (item: BackgroundItem, e: React.MouseEvent) => {
    if (isGuest) {
      onNotify?.({ msg: 'Sign in to buy backgrounds!', type: 'error' });
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
      onNotify?.({ msg: err instanceof Error ? err.message : 'Purchase failed', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const buyNow = async (item: BackgroundItem): Promise<boolean> => {
    if (isGuest) {
      onNotify?.({ msg: 'Sign in to buy backgrounds!', type: 'error' });
      return false;
    }
    if (balance < item.priceFlies) {
      onNotify?.({ msg: 'Not enough flies!', type: 'error' });
      return false;
    }
    setBusyId(item.id);
    try {
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
      return true;
    } catch (err) {
      onNotify?.({ msg: err instanceof Error ? err.message : 'Purchase failed', type: 'error' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const sellBackground = async (item: BackgroundItem, qty: number) => {
    if (isGuest) return;
    const currentCount = inventory[item.id] ?? 0;
    if (currentCount < qty) return;

    setBusyId(item.id);
    try {
      const res = await fetch('/api/backgrounds/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, amount: qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Sell failed');
      onNotify?.({ msg: `Sold ${qty}x ${item.name}!`, type: 'success' });
      onSpend?.(0);
      markFlyEarn();
      refresh();
    } catch (err) {
      onNotify?.({ msg: err instanceof Error ? err.message : 'Sell failed', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmSell = (qty: number) => {
    if (sellTarget) {
      void sellBackground(sellTarget, qty);
      setSellTarget(null);
    }
  };

  return {
    isLoading,
    catalog,
    inventory,
    equipped,
    balance,
    busyId,
    confirmingBuyId,
    setConfirmingBuyId,
    sellTarget,
    setSellTarget,
    sortItems,
    handleEquip,
    handleBuy,
    buyNow,
    confirmSell,
  };
}
