'use client';

import useSWR from 'swr';
import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemDef, RARITY_ORDER, WardrobeSlot } from '@/lib/skins/catalog';
import { CATALOG, rarityRank, sortByRarity } from '@/lib/skins/catalog';

type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    flies: number;
  };
  catalog: ItemDef[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const rarityBorder = (rarity: ItemDef['rarity']) =>
  ({
    common: 'border-zinc-300',
    uncommon: 'border-emerald-500',
    rare: 'border-sky-500',
    epic: 'border-violet-500',
    legendary: 'border-amber-500',
  }[rarity]);

const SLOT_LABEL: Record<WardrobeSlot, string> = {
  skin: 'Skins',
  hat: 'Hats',
  scarf: 'Scarves',
  hand_item: 'Hand Items',
};

/* ---------------- Inventory Tab ---------------- */

function InventoryTab({
  data,
  mutate,
}: {
  data?: ApiData | null;
  mutate: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const inv = data?.wardrobe?.inventory ?? {};
  const equipped = data?.wardrobe?.equipped ?? {};

  // group owned items by slot
  const ownedBySlot = useMemo(() => {
    const bySlot: Record<WardrobeSlot, ItemDef[]> = {
      skin: [],
      hat: [],
      scarf: [],
      hand_item: [],
    };
    const byId: Record<string, ItemDef> = Object.fromEntries(
      (data?.catalog ?? []).map((i) => [i.id, i] as const)
    );
    for (const [id, qty] of Object.entries(inv)) {
      if (!qty || qty <= 0) continue;
      const def = byId[id];
      if (def) bySlot[def.slot].push(def);
    }
    for (const slot of Object.keys(bySlot) as WardrobeSlot[]) {
      bySlot[slot] = sortByRarity(bySlot[slot]);
    }
    return bySlot;
  }, [inv, data?.catalog]);

  const toggleEquip = async (slot: WardrobeSlot, itemId: string) => {
    if (!data) return;
    const isEquipped = equipped[slot] === itemId;
    setSaving(itemId);
    const res = await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, itemId: isEquipped ? null : itemId }),
    });
    setSaving(null);
    if (res.ok) mutate();
  };

  if (!data) {
    return (
      <div className="py-10 text-sm text-center text-slate-600 dark:text-slate-400">
        Loading…
      </div>
    );
  }

  const empty =
    ownedBySlot.skin.length +
      ownedBySlot.hat.length +
      ownedBySlot.scarf.length +
      ownedBySlot.hand_item.length ===
    0;

  if (empty) {
    return (
      <div className="py-10 text-sm text-center text-slate-600 dark:text-slate-400">
        Your wardrobe is empty.
        <br />
        Earn items by completing your daily tasks — or{' '}
        <b>buy them in the Shop</b>.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {(Object.keys(SLOT_LABEL) as WardrobeSlot[]).map((slot) => {
        const items = ownedBySlot[slot];
        if (!items.length) return null;
        return (
          <div key={slot} className="space-y-3">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {SLOT_LABEL[slot]}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => {
                const isEquipped = equipped[slot] === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleEquip(slot, item.id)}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'rounded-2xl p-2 border-2 bg-white dark:bg-slate-900 shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-offset-1',
                      rarityBorder(item.rarity)
                    )}
                  >
                    <div className="grid rounded-xl aspect-square place-items-center bg-slate-50 dark:bg-slate-800">
                      <img
                        src={item.icon}
                        alt={item.name}
                        className="object-contain w-12 h-12"
                      />
                    </div>

                    <div className="mt-1 text-xs font-medium truncate">
                      {item.name}
                    </div>

                    <div className="mt-2">
                      <Button
                        size="sm"
                        className="w-full h-8"
                        disabled={saving === item.id}
                        variant={isEquipped ? 'default' : 'secondary'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEquip(slot, item.id);
                        }}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {isEquipped ? 'Unequip' : 'Equip'}
                      </Button>
                    </div>

                    <div className="mt-1 text-[11px] text-right text-slate-500">
                      ×{inv[item.id] ?? 0}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Shop Tab ---------------- */

function ShopTab({
  data,
  mutate,
}: {
  data?: ApiData | null;
  mutate: () => void;
}) {
  const [buying, setBuying] = useState<string | null>(null);
  const owned = data?.wardrobe?.inventory ?? {};
  const balance = data?.wardrobe?.flies ?? 0;

  const bySlot = useMemo(() => {
    const groups: Record<WardrobeSlot, ItemDef[]> = {
      skin: [],
      hat: [],
      scarf: [],
      hand_item: [],
    };
    for (const it of CATALOG) groups[it.slot].push(it);
    for (const slot of Object.keys(groups) as WardrobeSlot[]) {
      groups[slot] = groups[slot].sort(
        (a, b) => rarityRank[a.rarity] - rarityRank[b.rarity]
      );
    }
    return groups;
  }, []);

  const buy = async (itemId: string) => {
    if (!data) return;
    setBuying(itemId);
    const res = await fetch('/api/skins/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    setBuying(null);
    if (res.ok) mutate();
  };

  if (!data)
    return (
      <div className="py-10 text-sm text-center text-slate-500">Loading…</div>
    );

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500">
        Balance: <span className="font-medium">{balance}</span> flies
      </div>

      {(Object.keys(SLOT_LABEL) as WardrobeSlot[]).map((slot) => (
        <div key={slot} className="space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {SLOT_LABEL[slot]}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {bySlot[slot].map((item) => {
              const has = (owned[item.id] ?? 0) > 0;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-2xl p-2 border-2 bg-white dark:bg-slate-900 shadow-sm',
                    rarityBorder(item.rarity),
                    !has && 'opacity-70 grayscale'
                  )}
                >
                  <div className="grid rounded-xl aspect-square place-items-center bg-slate-50 dark:bg-slate-800">
                    <img
                      src={item.icon}
                      alt={item.name}
                      className="object-contain w-12 h-12"
                    />
                  </div>
                  <div className="mt-1 text-xs font-medium truncate">
                    {item.name}
                  </div>

                  <div className="mt-2">
                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={has || buying === item.id}
                      onClick={() => buy(item.id)}
                      variant={has ? 'secondary' : 'default'}
                    >
                      {has ? 'Owned' : `Buy (${item.priceFlies ?? 0})`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Trade Tab (placeholder) ---------------- */

function TradeTab() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600 dark:text-slate-400">
      <Lock className="w-4 h-4" />
      Trading is coming soon.
    </div>
  );
}

/* ---------------- Wrapper ---------------- */

export function WardrobePanel({
  open,
  onOpenChange,
  defaultTab = 'inventory',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: 'inventory' | 'shop' | 'trade';
}) {
  const { data, mutate } = useSWR<ApiData>(
    open ? '/api/skins/inventory' : null,
    fetcher
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 flex flex-col max-h-[65vh]">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Wardrobe</DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue={defaultTab}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="shop">Shop</TabsTrigger>
              <TabsTrigger value="trade">Trade</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 px-6 pb-6 overflow-y-auto overscroll-contain">
            <TabsContent value="inventory" className="mt-4">
              <InventoryTab data={data} mutate={() => void mutate()} />
            </TabsContent>

            <TabsContent value="shop" className="mt-4">
              <ShopTab data={data} mutate={() => void mutate()} />
            </TabsContent>

            <TabsContent value="trade" className="mt-4">
              <TradeTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
