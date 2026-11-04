import { RARITY_ORDER, type Rarity } from './catalog';

export const SHOP_LAYOUT_VERSION = 2;

export type ShopSalesConfig = {
  layoutVersion: number;
  refreshHour: number;
  freeSlots: number;
  plusSlots: number;
  specialEpicPercent: number;
  everydayRarities: Rarity[];
  everydayRarePercent: number;
  wishlistSlot: boolean;
  saleDiscountPercent: number;
  plusRerolls: number;
  adRerolls: number;
};

export const DEFAULT_SHOP_SALES: ShopSalesConfig = {
  layoutVersion: SHOP_LAYOUT_VERSION,
  refreshHour: 4,
  freeSlots: 6,
  plusSlots: 6,
  specialEpicPercent: 35,
  everydayRarities: ['common', 'uncommon'],
  everydayRarePercent: 35,
  wishlistSlot: true,
  saleDiscountPercent: 50,
  plusRerolls: 1,
  adRerolls: 1,
};

export const SHOP_TIERS: readonly Rarity[] = RARITY_ORDER.filter(
  (rarity) => rarity !== 'legendary',
);

export function rerollsAllowed(config: ShopSalesConfig, isPlus: boolean) {
  return Math.max(0, isPlus ? config.plusRerolls : config.adRerolls);
}
