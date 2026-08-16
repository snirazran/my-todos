import { isTradeOnlyRarity } from './catalog';
import type { ItemDef, Rarity, WardrobeSlot } from './catalog';

export type WishlistKind = 'item' | 'background';

export type WishlistPin = {
  itemId: string;
  kind: WishlistKind;
  pinnedAt: string;
  /**
   * `${dayKey}:${itemId}` of the last deal we alerted on. One notification per
   * appearance — re-pinning or rerolling must never re-fire the same alert.
   */
  notifiedDealKey?: string | null;
};

export type WishlistView = WishlistPin & {
  name: string;
  price: number;
  rarity: Rarity;
  slot: WardrobeSlot | null;
  riveIndex: number;
  imageUrl?: string;
  owned: boolean;
};

export type WishlistSource = {
  id: string;
  name: string;
  rarity: Rarity;
  priceFlies?: number;
  slot?: WardrobeSlot;
  riveIndex?: number;
  imageUrl?: string;
};

export type WishlistState = {
  /** The one the balance surfaces count down to: newest still-unowned pin. */
  goal: WishlistView | null;
  items: WishlistView[];
  slots: { used: number; max: number };
};

export function isWishlistPin(value: unknown): value is WishlistPin {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<WishlistPin>;
  return (
    typeof pin.itemId === 'string' &&
    pin.itemId.length > 0 &&
    (pin.kind === 'item' || pin.kind === 'background')
  );
}

export function resolveWishlist(
  pin: unknown,
  source: WishlistSource | null | undefined,
  inventory: Record<string, number> | undefined,
): WishlistView | null {
  if (!isWishlistPin(pin) || !source) return null;
  const price = source.priceFlies ?? 0;
  if (price <= 0) return null;
  return {
    itemId: pin.itemId,
    kind: pin.kind,
    pinnedAt: pin.pinnedAt ?? new Date().toISOString(),
    name: source.name,
    price,
    rarity: source.rarity,
    slot: source.slot ?? null,
    riveIndex: source.riveIndex ?? 0,
    imageUrl: source.imageUrl,
    owned: (inventory?.[pin.itemId] ?? 0) > 0,
  };
}

export function wishlistPinKey(pin: { itemId: string; kind: WishlistKind }) {
  return `${pin.kind}:${pin.itemId}`;
}

/**
 * Every pin on the list, newest first. Reads the list field, falling back to
 * the single pin older accounts still carry.
 */
export function readWishlistPins(
  wardrobe: { wishlist?: unknown; wishlistItems?: unknown } | null | undefined,
): WishlistPin[] {
  const list = Array.isArray(wardrobe?.wishlistItems)
    ? (wardrobe!.wishlistItems as unknown[]).filter(isWishlistPin)
    : [];
  if (list.length > 0) return list;
  const legacy = wardrobe?.wishlist;
  return isWishlistPin(legacy) ? [legacy] : [];
}

/** Newest un-owned pin, or the newest pin when everything on the list is owned. */
export function pickWishlistGoal(items: WishlistView[]): WishlistView | null {
  return items.find((entry) => !entry.owned) ?? items[0] ?? null;
}

export function catalogToWishlistSource(item: ItemDef): WishlistSource {
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    priceFlies: item.priceFlies,
    slot: item.slot,
    riveIndex: item.riveIndex,
  };
}

/**
 * What the pinned item actually costs right now. When it lands on the daily
 * shelf the goal has to move with it — otherwise the counter keeps saving
 * toward a price nobody is charging today.
 */
export function resolveWishlistPricing(
  wishlist: WishlistView | null | undefined,
  deals:
    | { itemId: string; dealPrice: number; discountPercent: number }[]
    | undefined,
) {
  if (!wishlist) return null;
  const deal =
    wishlist.kind === 'item'
      ? deals?.find((entry) => entry.itemId === wishlist.itemId)
      : undefined;
  return {
    price: deal ? deal.dealPrice : wishlist.price,
    fullPrice: wishlist.price,
    discountPercent: deal?.discountPercent ?? 0,
    onDeal: !!deal,
  };
}

/** Flies still needed, and how far along the save is (0–1). */
export function wishlistProgress(price: number, balance: number) {
  const safePrice = Math.max(1, price);
  const clamped = Math.max(0, Math.min(balance, safePrice));
  return {
    remaining: Math.max(0, safePrice - balance),
    ratio: clamped / safePrice,
    reached: balance >= safePrice,
  };
}

export type WishlistDeal = {
  itemId: string;
  dealPrice: number;
  discountPercent: number;
};

export type WishlistEntry = {
  view: WishlistView;
  key: string;
  price: number;
  fullPrice: number;
  discountPercent: number;
  onDeal: boolean;
  tradeOnly: boolean;
  affordable: boolean;
  remaining: number;
  ratio: number;
};

export type WishlistBucket = 'deal' | 'ready' | 'saving' | 'trade' | 'owned';

export function wishlistBucket(entry: WishlistEntry): WishlistBucket {
  if (entry.view.owned) return 'owned';
  if (entry.tradeOnly) return 'trade';
  if (entry.onDeal) return 'deal';
  return entry.affordable ? 'ready' : 'saving';
}

const BUCKET_RANK: Record<WishlistBucket, number> = {
  deal: 0,
  ready: 1,
  saving: 2,
  trade: 3,
  owned: 4,
};

export function buildWishlistEntries(
  items: WishlistView[] | undefined,
  deals: WishlistDeal[] | undefined,
  balance: number,
): WishlistEntry[] {
  const entries = (items ?? []).map((view) => {
    const pricing = resolveWishlistPricing(view, deals) ?? {
      price: view.price,
      fullPrice: view.price,
      discountPercent: 0,
      onDeal: false,
    };
    const tradeOnly = isTradeOnlyRarity(view.rarity);
    const progress = wishlistProgress(pricing.price, balance);
    return {
      view,
      key: wishlistPinKey(view),
      ...pricing,
      tradeOnly,
      affordable: !tradeOnly && !view.owned && progress.reached,
      remaining: progress.remaining,
      ratio: progress.ratio,
    };
  });
  return entries.sort(
    (a, b) =>
      BUCKET_RANK[wishlistBucket(a)] - BUCKET_RANK[wishlistBucket(b)] ||
      b.ratio - a.ratio,
  );
}
