import { RARITY_ORDER, type Rarity } from './catalog';

export const SHOP_LAYOUT_VERSION = 2;

export type ShopSalesConfig = {
  layoutVersion: number;
  refreshHour: number;
  freeSlots: number;
  plusSlots: number;
  everydayRarities: Rarity[];
  everydayRarePercent: number;
  plusEpicPercent: number;
  wishlistSlot: boolean;
  saleDiscountPercent: number;
  freeRerolls: number;
  plusRefreshes: number;
  adRerolls: number;
};

export const DEFAULT_SHOP_SALES: ShopSalesConfig = {
  layoutVersion: SHOP_LAYOUT_VERSION,
  refreshHour: 4,
  freeSlots: 6,
  plusSlots: 6,
  everydayRarities: ['common', 'uncommon'],
  everydayRarePercent: 35,
  plusEpicPercent: 60,
  wishlistSlot: true,
  saleDiscountPercent: 50,
  freeRerolls: 1,
  plusRefreshes: 3,
  adRerolls: 1,
};

export const SHOP_TIERS: readonly Rarity[] = RARITY_ORDER.filter(
  (rarity) => rarity !== 'legendary',
);

export function rerollsAllowed(config: ShopSalesConfig, isPlus: boolean) {
  return Math.max(
    0,
    isPlus
      ? Math.max(config.plusRefreshes, config.freeRerolls)
      : config.freeRerolls + config.adRerolls,
  );
}

export function rerollNeedsAd(
  config: ShopSalesConfig,
  isPlus: boolean,
  used: number,
) {
  return !isPlus && used >= config.freeRerolls;
}
