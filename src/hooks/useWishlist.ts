'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import {
  INVENTORY_SUMMARY_KEY,
  patchInventoryWishlist,
} from '@/hooks/useInventory';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import {
  resolveWishlistPricing,
  wishlistPinKey,
  wishlistProgress,
  type WishlistKind,
  type WishlistState,
  type WishlistView,
} from '@/lib/skins/wishlist';

type SummaryShape = {
  wishlist?: WishlistView | null;
  wishlistItems?: WishlistView[];
  wishlistSlots?: WishlistState['slots'];
  wardrobe?: { flies?: number };
  dailyDeals?: {
    itemId: string;
    dealPrice: number;
    discountPercent: number;
    onSale?: boolean;
  }[];
};

type WishlistResponse = {
  wishlist?: WishlistView | null;
  wishlistItems?: WishlistView[];
  wishlistSlots?: WishlistState['slots'];
  error?: string;
};

const EMPTY: WishlistView[] = [];

/**
 * The saving-for list, read off the inventory summary that every balance
 * surface already subscribes to — so the goal rides along with the balance
 * instead of adding a request per surface.
 */
export function useWishlist(enabled: boolean = true) {
  const { data } = useSWR<SummaryShape>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = data?.wishlistItems ?? EMPTY;
  const slots = data?.wishlistSlots ?? { used: items.length, max: 0 };
  const balance = data?.wardrobe?.flies ?? 0;

  // The goal worth showing is the one within reach, not whichever pin happens
  // to be first: the goal gradient only pulls when the gap looks closeable.
  // Affordable pins rank by price (the best thing you can have right now),
  // everything else by what is still missing.
  const closest = useMemo(() => {
    const ranked = items
      .map((entry) => {
        const entryPricing = resolveWishlistPricing(entry, data?.dailyDeals);
        if (!entryPricing) return null;
        return {
          entry,
          pricing: entryPricing,
          progress: wishlistProgress(entryPricing.price, balance),
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> => !!row && !row.entry.owned,
      )
      .sort((a, b) => {
        if (a.progress.reached !== b.progress.reached) {
          return a.progress.reached ? -1 : 1;
        }
        return a.progress.reached
          ? b.pricing.price - a.pricing.price
          : a.progress.remaining - b.progress.remaining;
      });
    return ranked[0] ?? null;
  }, [items, data?.dailyDeals, balance]);

  const wishlist = closest?.entry ?? data?.wishlist ?? null;
  const pricing =
    closest?.pricing ?? resolveWishlistPricing(wishlist, data?.dailyDeals);
  const progress =
    closest?.progress ??
    (pricing ? wishlistProgress(pricing.price, balance) : null);

  const keys = useMemo(
    () => new Set(items.map((entry) => wishlistPinKey(entry))),
    [items],
  );
  const has = useCallback(
    (itemId: string, kind: WishlistKind = 'item') =>
      keys.has(wishlistPinKey({ itemId, kind })),
    [keys],
  );
  const isFull = slots.max > 0 && slots.used >= slots.max;

  const apply = (payload: WishlistResponse) => {
    patchInventoryWishlist({
      wishlist: payload.wishlist ?? null,
      wishlistItems: payload.wishlistItems ?? [],
      wishlistSlots: payload.wishlistSlots,
    });
  };

  const add = useCallback(
    async (itemId: string, kind: WishlistKind = 'item') => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      hapticImpact();
      try {
        const res = await fetch('/api/skins/wishlist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, kind }),
        });
        const payload: WishlistResponse = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(payload.error ?? 'Could not add this to your wishlist.');
          return false;
        }
        apply(payload);
        return true;
      } catch {
        setError('Could not add this to your wishlist.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const remove = useCallback(
    async (itemId: string, kind: WishlistKind = 'item') => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      hapticTick();
      try {
        const res = await fetch(
          `/api/skins/wishlist?itemId=${encodeURIComponent(itemId)}&kind=${kind}`,
          { method: 'DELETE' },
        );
        const payload: WishlistResponse = await res.json().catch(() => ({}));
        if (!res.ok) return false;
        apply(payload);
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const toggle = useCallback(
    async (itemId: string, kind: WishlistKind = 'item') =>
      has(itemId, kind) ? remove(itemId, kind) : add(itemId, kind),
    [add, has, remove],
  );

  const clear = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    hapticTick();
    patchInventoryWishlist({ wishlist: null, wishlistItems: [] });
    try {
      const res = await fetch('/api/skins/wishlist', { method: 'DELETE' });
      const payload: WishlistResponse = await res.json().catch(() => ({}));
      if (res.ok) apply(payload);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    wishlist,
    items,
    slots,
    isFull,
    balance,
    pricing,
    progress,
    has,
    add,
    /** @deprecated Use `add` — kept so older callers keep compiling. */
    pin: add,
    remove,
    toggle,
    clear,
    busy,
    error,
  };
}
