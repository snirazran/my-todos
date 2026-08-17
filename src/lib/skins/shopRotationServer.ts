import { ensureShopSalesConfig } from '@/lib/models/ShopSalesConfig';
import { getShopRotation, shopDay, rerollsUsed, type DealReroll } from './dailyDeal';
import { rerollsAllowed, type ShopSalesConfig } from './shopSales';
import { readWishlistPins } from './wishlist';
import type { ItemDef } from './catalog';

type WardrobeLike = {
  inventory?: Record<string, number> | null;
  wishlist?: unknown;
  wishlistItems?: unknown;
  dealReroll?: DealReroll | null;
} | null | undefined;

export function ownedItemIds(wardrobe: WardrobeLike): string[] {
  return Object.entries(wardrobe?.inventory ?? {})
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([id]) => id);
}

/** Pinned items the player doesn't own yet — the only ones worth a slot. */
export function wishlistShopIds(wardrobe: WardrobeLike): string[] {
  const owned = new Set(ownedItemIds(wardrobe));
  return readWishlistPins(wardrobe)
    .filter((pin) => pin.kind === 'item' && !owned.has(pin.itemId))
    .map((pin) => pin.itemId);
}

/**
 * One place that assembles a player's storefront, so the shop grid, the home
 * rail, the purchase endpoint and the wishlist push can never quote different
 * prices for the same day.
 */
export async function loadShopRotation({
  catalog,
  wardrobe,
  timezone,
  isPlus,
  now = new Date(),
  config,
  rerollOverride,
}: {
  catalog: ItemDef[];
  wardrobe: WardrobeLike;
  timezone: string;
  isPlus: boolean;
  now?: Date;
  config?: ShopSalesConfig;
  /** Reroll index to render instead of the stored one. */
  rerollOverride?: number;
}) {
  const resolved = config ?? (await ensureShopSalesConfig());
  const { dayKey, endsAt } = shopDay(now, timezone, resolved);
  const allowed = rerollsAllowed(resolved, isPlus);
  const used = rerollsUsed(wardrobe?.dealReroll ?? undefined, dayKey, allowed);
  const rerollCount = rerollOverride ?? used;

  return {
    config: resolved,
    dayKey,
    endsAt,
    rerollsAllowed: allowed,
    rerollsUsed: used,
    rerollsLeft: Math.max(0, allowed - used),
    deals: getShopRotation({
      catalog,
      now,
      timezone,
      config: resolved,
      rerollCount,
      ownedIds: ownedItemIds(wardrobe),
      wishlistItemIds: wishlistShopIds(wardrobe),
    }),
  };
}
