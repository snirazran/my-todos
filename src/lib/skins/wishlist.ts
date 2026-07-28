import type { ItemDef, Rarity, WardrobeSlot } from './catalog';

export type WishlistKind = 'item' | 'background';

export type WishlistPin = {
  itemId: string;
  kind: WishlistKind;
  pinnedAt: string;
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
