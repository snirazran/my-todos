import { RARITY_ORDER, type Rarity } from './catalog';

export type ShopSalesConfig = {
  /** Slots on today's shelf. */
  slots: number;
  /** Local hour the shelf rolls over at. */
  refreshHour: number;
  /** Slots drawn from the two cheap tiers. */
  affordableSlots: number;
  /** Split inside those slots: how often the draw takes a common. */
  commonWeightPercent: number;
  rareSlots: number;
  epicSlots: number;
  /** Reserve one slot for an un-owned wishlisted item when the player has one. */
  wishlistSlot: boolean;
  /** How often that reserved slot is one of the day's discounts. */
  wishlistDealChancePercent: number;
  discountedSlots: number;
  /** 0 = Sunday. */
  weekendDay: number;
  weekendDiscountedSlots: number;
  weekendDiscountPercent: number;
  /** Flat discount per tier — deeper on rarer items, so the sale is the event. */
  rarityDiscountPercent: Record<Rarity, number>;
  /** Share of days a slot of that tier is one of the discounts. */
  raritySaleDaysPercent: Record<Rarity, number>;
  /** Ceiling every discount is clamped to, weekend included. */
  maxDiscountPercent: number;
  plusRerolls: number;
  adRerolls: number;
};

export const DEFAULT_SHOP_SALES: ShopSalesConfig = {
  slots: 6,
  refreshHour: 4,
  affordableSlots: 3,
  commonWeightPercent: 60,
  rareSlots: 2,
  epicSlots: 1,
  wishlistSlot: true,
  wishlistDealChancePercent: 100,
  discountedSlots: 6,
  weekendDay: 6,
  weekendDiscountedSlots: 6,
  weekendDiscountPercent: 40,
  rarityDiscountPercent: {
    common: 20,
    uncommon: 25,
    rare: 30,
    epic: 35,
    legendary: 0,
  },
  raritySaleDaysPercent: {
    common: 100,
    uncommon: 100,
    rare: 100,
    epic: 100,
    legendary: 0,
  },
  maxDiscountPercent: 40,
  plusRerolls: 1,
  adRerolls: 1,
};

/** Tiers the shelf composes from, cheapest first. Legendary is trade-only. */
export const SHOP_TIERS: readonly Rarity[] = RARITY_ORDER.filter(
  (rarity) => rarity !== 'legendary',
);

export function rerollsAllowed(config: ShopSalesConfig, isPlus: boolean) {
  return Math.max(0, isPlus ? config.plusRerolls : config.adRerolls);
}

export function discountPercentFor(
  config: ShopSalesConfig,
  rarity: Rarity,
  weekend: boolean,
): number {
  const raw = weekend
    ? config.weekendDiscountPercent
    : (config.rarityDiscountPercent[rarity] ?? 0);
  return Math.max(0, Math.min(config.maxDiscountPercent, raw));
}
