'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import {
  INVENTORY_SUMMARY_KEY,
  patchInventoryWishlist,
} from '@/hooks/useInventory';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import { wishlistProgress, type WishlistKind, type WishlistView } from '@/lib/skins/wishlist';

type SummaryShape = {
  wishlist?: WishlistView | null;
  wardrobe?: { flies?: number };
};

/**
 * The single "saving for" pin, read off the inventory summary that every
 * balance surface already subscribes to — so the goal rides along with the
 * balance instead of adding a request per surface.
 */
export function useWishlist(enabled: boolean = true) {
  const { data } = useSWR<SummaryShape>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState(false);

  const wishlist = data?.wishlist ?? null;
  const balance = data?.wardrobe?.flies ?? 0;
  const progress = wishlist
    ? wishlistProgress(wishlist.price, balance)
    : null;

  const pin = useCallback(
    async (itemId: string, kind: WishlistKind = 'item') => {
      if (busy) return false;
      setBusy(true);
      hapticImpact();
      try {
        const res = await fetch('/api/skins/wishlist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, kind }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.wishlist) return false;
        patchInventoryWishlist(payload.wishlist as WishlistView);
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const clear = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    hapticTick();
    patchInventoryWishlist(null);
    try {
      await fetch('/api/skins/wishlist', { method: 'DELETE' });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { wishlist, balance, progress, pin, clear, busy };
}
