'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, PackageOpen, ShoppingBag, X } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import Fly from '@/components/ui/fly';
import { RarityCornerBadge } from '@/components/ui/skins/RarityCornerBadge';
import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
  mutateInventorySummary,
  useInventory,
} from '@/hooks/useInventory';
import { mutateBackgrounds, useBackgrounds, type BackgroundItem } from '@/hooks/useBackgrounds';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import type { ItemDef } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';

type ShopTab = 'shop' | 'inventory';
type GameShopEntry =
  | { kind: 'item'; id: string; name: string; rarity: ItemDef['rarity']; price: number; item: ItemDef }
  | { kind: 'background'; id: string; name: string; rarity: BackgroundItem['rarity']; price: number; background: BackgroundItem };

const RARITY_STYLE: Record<ItemDef['rarity'], string> = {
  common: 'border-border/70 bg-card/90',
  uncommon: 'border-emerald-400/45 bg-emerald-500/10',
  rare: 'border-sky-400/45 bg-sky-500/10',
  epic: 'border-violet-400/45 bg-violet-500/10',
  legendary: 'border-amber-400/55 bg-amber-500/10',
};

export function FlyGameShop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<ShopTab>('shop');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const { data, mutate, isLoading } = useInventory(open);
  const { data: backgroundData, mutate: mutateBackgroundData, isLoading: backgroundsLoading } = useBackgrounds(open);

  const balance = data?.wardrobe.flies ?? backgroundData?.flies ?? 0;
  const entries = useMemo(() => {
    const clothing: GameShopEntry[] = (data?.catalog ?? [])
      .filter((item) => item.slot !== 'container')
      .map((item) => ({ kind: 'item', id: item.id, name: item.name, rarity: item.rarity, price: item.priceFlies ?? 0, item }));
    const backgrounds: GameShopEntry[] = (backgroundData?.catalog ?? []).map((background) => ({
      kind: 'background',
      id: background.id,
      name: background.name,
      rarity: background.rarity,
      price: background.priceFlies ?? 0,
      background,
    }));
    const owned = (entry: GameShopEntry) => entry.kind === 'item'
      ? (data?.wardrobe?.inventory?.[entry.id] ?? 0) > 0
      : (backgroundData?.inventory?.[entry.id] ?? 0) > 0;
    return [...clothing, ...backgrounds].filter((entry) => tab === 'inventory' ? owned(entry) : !owned(entry));
  }, [backgroundData?.catalog, backgroundData?.inventory, data?.catalog, data?.wardrobe?.inventory, tab]);

  const showNotice = (text: string, error = false) => {
    setNotice({ text, error });
    window.setTimeout(() => setNotice(null), 2200);
  };

  const refreshCurrencyAndCloset = () => {
    void mutate();
    void mutateBackgroundData();
    mutateInventoryCaches();
    mutateBackgrounds();
  };

  const buyEntry = async (entry: GameShopEntry) => {
    if (busyId) return;
    if (balance < entry.price) {
      hapticTick();
      showNotice(`You need ${entry.price - balance} more flies.`, true);
      return;
    }
    if (confirmId !== entry.id) {
      hapticTick();
      setConfirmId(entry.id);
      return;
    }
    setBusyId(entry.id);
    setConfirmId(null);
    try {
      const response = await fetch(entry.kind === 'item' ? '/api/skins/shop' : '/api/backgrounds/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.kind === 'item'
          ? { itemId: entry.id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : { id: entry.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Purchase failed');
      hapticImpact();
      showNotice(`${entry.name} unlocked!`);
      refreshCurrencyAndCloset();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Purchase failed', true);
      refreshCurrencyAndCloset();
    } finally {
      setBusyId(null);
    }
  };

  const equipEntry = async (entry: GameShopEntry) => {
    if (busyId) return;
    const isEquipped = entry.kind === 'item'
      ? data?.wardrobe.equipped[entry.item.slot] === entry.id
      : backgroundData?.equipped === entry.id;
    if (entry.kind === 'background' && isEquipped) return;
    setBusyId(entry.id);
    hapticImpact();
    beginEquipMutation();
    try {
      if (entry.kind === 'item') {
        const itemId = isEquipped ? null : entry.id;
        await mutate((current) => current?.wardrobe ? {
          ...current,
          wardrobe: { ...current.wardrobe, equipped: { ...current.wardrobe.equipped, [entry.item.slot]: itemId } },
        } : current, { revalidate: false });
        const response = await fetch('/api/skins/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot: entry.item.slot, itemId }),
        });
        if (!response.ok) throw new Error('Could not update outfit');
      } else {
        if (backgroundData) {
          const next = { ...backgroundData, equipped: entry.id };
          await mutateBackgroundData(next, { revalidate: false });
          mutateBackgrounds(next);
        }
        const response = await fetch('/api/backgrounds/equip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: entry.id }),
        });
        if (!response.ok) throw new Error('Could not change background');
      }
      showNotice(isEquipped ? `${entry.name} removed.` : `${entry.name} equipped!`);
      mutateInventorySummary();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not equip item', true);
      refreshCurrencyAndCloset();
    } finally {
      endEquipMutation();
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onPointerDown={onClose} data-game-control>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl sm:rounded-[28px]" onPointerDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Frog shop">
        <div className="flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 sm:px-5">
          <div><p className="font-display text-2xl text-primary">FROG SHOP</p><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Catch. Unlock. Equip.</p></div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-black text-primary"><Fly size={22} paused interactive={false} /> {balance}</div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-muted text-foreground" aria-label="Close shop"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-muted/70 p-1.5">
          {(['shop', 'inventory'] as const).map((value) => (
            <button key={value} type="button" onClick={() => { setTab(value); setConfirmId(null); hapticTick(); }} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black uppercase transition', tab === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card')}>
              {value === 'shop' ? <ShoppingBag className="h-4 w-4" /> : <PackageOpen className="h-4 w-4" />}
              {value}
            </button>
          ))}
        </div>

        {notice ? <div className={cn('mx-4 mt-3 rounded-xl px-3 py-2 text-center text-xs font-black', notice.error ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>{notice.text}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {isLoading || backgroundsLoading ? (
            <div className="grid h-48 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
          ) : entries.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {entries.map((entry) => {
                const equipped = entry.kind === 'item'
                  ? data?.wardrobe.equipped[entry.item.slot] === entry.id
                  : backgroundData?.equipped === entry.id;
                const confirming = confirmId === entry.id;
                const busy = busyId === entry.id;
                return (
                  <button key={`${entry.kind}-${entry.id}`} type="button" disabled={!!busyId} onClick={() => void (tab === 'shop' ? buyEntry(entry) : equipEntry(entry))} className={cn('group relative flex min-h-52 flex-col overflow-hidden rounded-2xl border p-2 text-left transition active:scale-[.98] disabled:opacity-60', RARITY_STYLE[entry.rarity], equipped && 'ring-2 ring-primary')}>
                    <RarityCornerBadge rarity={entry.rarity} />
                    <div className="relative grid h-36 w-full place-items-center overflow-hidden rounded-xl bg-background/70">
                      {entry.kind === 'item' ? (
                        <FrogSnapshot indices={{ [entry.item.slot]: entry.item.riveIndex }} width={156} height={174} visualOffsetY={0} className="-translate-y-2 scale-125" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.background.images.mobile} alt="" className="h-full w-full object-cover" />
                      )}
                      {equipped ? <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span> : null}
                    </div>
                    <p className="mt-2 w-full truncate text-sm font-black text-foreground">{entry.name}</p>
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{entry.kind === 'item' ? entry.item.slot.replace('_', ' ') : 'background'}</p>
                    <div className={cn('mt-auto flex min-h-8 w-full items-center justify-center rounded-lg px-2 text-[10px] font-black uppercase', tab === 'shop' ? (confirming ? 'bg-amber-400 text-amber-950' : 'bg-primary text-primary-foreground') : (equipped ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground'))}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === 'shop' ? (confirming ? 'Tap again to buy' : <span className="flex items-center gap-1"><Fly size={17} paused interactive={false} />{entry.price}</span>) : (equipped ? 'Equipped' : 'Tap to equip')}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
              <div><p className="font-display text-2xl text-foreground">{tab === 'shop' ? 'YOU UNLOCKED IT ALL!' : 'YOUR CLOSET IS EMPTY'}</p><p className="mt-1 text-sm font-semibold text-muted-foreground">{tab === 'shop' ? 'That frog has serious style.' : 'Catch flies, then spend them here.'}</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
