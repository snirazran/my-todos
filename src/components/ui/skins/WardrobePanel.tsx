// components/ui/skins/WardrobePanel.tsx
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
import { useSkins } from '@/lib/skinsStore';
import type { SkinDef } from '@/lib/skins/catalog';
import { CATALOG, RARITY_ORDER, sortByRarity } from '@/lib/skins/catalog';

type ApiData = {
  skins: {
    equippedId: string | null;
    inventory: Record<string, number>;
    flies: number;
  };
  catalog: SkinDef[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const rarityBorder = (rarity: SkinDef['rarity']) =>
  ({
    common: 'border-zinc-300',
    uncommon: 'border-emerald-500',
    rare: 'border-sky-500',
    epic: 'border-violet-500',
    legendary: 'border-amber-500',
  }[rarity]);

/* ---------------- Inventory Tab ---------------- */

function InventoryTab({
  data,
  mutate,
}: {
  data?: ApiData | null;
  mutate: () => void;
}) {
  const setEquippedById = useSkins((s) => s.setEquippedById);
  const equippedIdStore = useSkins((s) => s.equippedId);
  const [saving, setSaving] = useState<string | null>(null);

  // always run hooks; use safe fallbacks
  const catalogById = useMemo(
    () =>
      Object.fromEntries((data?.catalog ?? []).map((s) => [s.id, s] as const)),
    [data?.catalog]
  );

  const inv = data?.skins?.inventory ?? {};

  const ownedSkins: SkinDef[] = useMemo(() => {
    const ids = Object.entries(inv)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([id]) => id);
    const defs = ids.map((id) => catalogById[id]).filter(Boolean) as SkinDef[];
    return sortByRarity(defs);
  }, [inv, catalogById]);

  const equippedId = data?.skins?.equippedId ?? null;
  const loading = !data; // for UI only

  const toggleEquip = async (skinId: string) => {
    if (!data) return; // still guard side-effects
    const currentlyEquipped =
      equippedId === skinId || equippedIdStore === skinId;

    setSaving(skinId);
    const res = await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId: currentlyEquipped ? null : skinId }),
    });
    setSaving(null);
    if (res.ok) {
      setEquippedById(currentlyEquipped ? null : skinId);
      mutate();
    }
  };

  if (loading || ownedSkins.length === 0) {
    return (
      <div className="py-10 text-sm text-center text-slate-600 dark:text-slate-400">
        {loading ? (
          'Loading…'
        ) : (
          <>
            Your wardrobe is empty.
            <br />
            Earn skins by completing all your daily tasks — or{' '}
            <span className="font-semibold">buy them in the Shop</span>.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {ownedSkins.map((skin) => {
          const equipped =
            equippedId === skin.id || equippedIdStore === skin.id;
          return (
            <div
              key={skin.id}
              onClick={() => toggleEquip(skin.id)}
              role="button"
              tabIndex={0}
              className={cn(
                'rounded-2xl p-2 border-2 bg-white dark:bg-slate-900 shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-offset-1',
                rarityBorder(skin.rarity)
              )}
            >
              <div className="grid rounded-xl aspect-square place-items-center bg-slate-50 dark:bg-slate-800">
                <img
                  src={skin.icon}
                  alt={skin.name}
                  className="object-contain w-12 h-12"
                />
              </div>

              <div className="mt-1 text-xs font-medium truncate">
                {skin.name}
              </div>

              <div className="mt-2">
                <Button
                  size="sm"
                  className="w-full h-8"
                  disabled={saving === skin.id}
                  variant={equipped ? 'default' : 'secondary'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEquip(skin.id);
                  }}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  {equipped ? 'Unequip' : 'Equip'}
                </Button>
              </div>

              <div className="mt-1 text-[11px] text-right text-slate-500">
                ×{inv[skin.id] ?? 0}
              </div>
            </div>
          );
        })}
      </div>
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
  const [buying, setBuying] = useState<string | null>(null); // always created
  const owned = data?.skins?.inventory ?? {};
  const balance = data?.skins?.flies ?? 0;
  const loading = !data;

  const grouped = useMemo(() => {
    const groups: Record<string, SkinDef[]> = {};
    for (const r of RARITY_ORDER) groups[r] = [];
    for (const s of CATALOG) groups[s.rarity].push(s);
    for (const r of RARITY_ORDER) groups[r] = sortByRarity(groups[r]);
    return groups;
  }, []);

  const buy = async (skinId: string) => {
    if (!data) return;
    setBuying(skinId);
    const res = await fetch('/api/skins/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId }),
    });
    setBuying(null);
    if (res.ok) mutate();
  };

  if (loading)
    return (
      <div className="py-10 text-sm text-center text-slate-500">Loading…</div>
    );

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500">
        Balance: <span className="font-medium">{balance}</span> flies
      </div>

      {RARITY_ORDER.map((r) => (
        <div key={r} className="space-y-3">
          <div className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">
            {r}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {grouped[r].map((skin) => {
              const has = (owned[skin.id] ?? 0) > 0;
              return (
                <div
                  key={skin.id}
                  className={cn(
                    'rounded-2xl p-2 border-2 bg-white dark:bg-slate-900 shadow-sm',
                    rarityBorder(skin.rarity),
                    !has && 'opacity-70 grayscale'
                  )}
                >
                  <div className="grid rounded-xl aspect-square place-items-center bg-slate-50 dark:bg-slate-800">
                    <img
                      src={skin.icon}
                      alt={skin.name}
                      className="object-contain w-12 h-12"
                    />
                  </div>
                  <div className="mt-1 text-xs font-medium truncate">
                    {skin.name}
                  </div>

                  <div className="mt-2">
                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={has || buying === skin.id}
                      onClick={() => buy(skin.id)}
                      variant={has ? 'secondary' : 'default'}
                    >
                      {has ? 'Owned' : 'Buy (0)'}
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
  const { data, mutate, isLoading } = useSWR<ApiData>(
    open ? '/api/skins/inventory' : null,
    fetcher
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 flex flex-col max-h-[65vh]">
        {/* header (no grow, no scroll) */}
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Wardrobe</DialogTitle>
        </DialogHeader>

        {/* tabs root stretches */}
        <Tabs
          defaultValue={defaultTab}
          className="flex flex-col flex-1 min-h-0"
        >
          {/* tab buttons (no grow) */}
          <div className="px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="shop">Shop</TabsTrigger>
              <TabsTrigger value="trade">Trade</TabsTrigger>
            </TabsList>
          </div>

          {/* the ONLY scrollable area */}
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
