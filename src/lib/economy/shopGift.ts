import type { FlyEconomyConfig } from './defaults';

type ShopGiftConfig = FlyEconomyConfig['shopGift'];

export type ShopGiftRoll = {
  base: number;
  lucky: boolean;
  plus: boolean;
  amount: number;
};

export type ShopGiftStatus = {
  available: boolean;
  dayKey: string;
  endsAt: string;
  amount?: number;
  luckyMultiplier?: number | null;
  first?: boolean;
};

export const SHOP_GIFT_MIN_FLIES = 15;
export const SHOP_GIFT_MAX_FLIES = 30;
export const SHOP_GIFT_FULL_BELOW_BALANCE = 100;
export const SHOP_GIFT_FLOOR_FROM_BALANCE = 2000;
export const SHOP_GIFT_FIRST_FLIES = 150;

export function shopGiftBaseFlies(balance: number): number {
  const low = Math.log(SHOP_GIFT_FULL_BELOW_BALANCE);
  const high = Math.log(SHOP_GIFT_FLOOR_FROM_BALANCE);
  const t = Math.min(
    1,
    Math.max(0, (Math.log(Math.max(1, balance)) - low) / (high - low)),
  );
  return Math.round(
    SHOP_GIFT_MAX_FLIES - t * (SHOP_GIFT_MAX_FLIES - SHOP_GIFT_MIN_FLIES),
  );
}

export function rollShopGift(
  balance: number,
  premium: boolean,
  config: ShopGiftConfig,
  first = false,
  random: () => number = Math.random,
): ShopGiftRoll {
  if (first) {
    return {
      base: SHOP_GIFT_FIRST_FLIES,
      lucky: false,
      plus: false,
      amount: SHOP_GIFT_FIRST_FLIES,
    };
  }
  const base = shopGiftBaseFlies(balance);
  const lucky = random() * 100 < config.luckyChancePercent;
  const amount =
    base *
    (lucky ? config.luckyMultiplier : 1) *
    (premium ? config.plusMultiplier : 1);
  return { base, lucky, plus: premium, amount: Math.floor(amount) };
}

export function shopGiftStatus(
  claimedDayKey: string | undefined,
  shop: { dayKey: string; endsAt: string },
  enabled: boolean,
  preview?: { balance: number; premium: boolean; config: ShopGiftConfig },
): ShopGiftStatus {
  const first = !claimedDayKey;
  return {
    available: enabled && claimedDayKey !== shop.dayKey,
    dayKey: shop.dayKey,
    endsAt: shop.endsAt,
    first,
    ...(preview
      ? first
        ? { amount: SHOP_GIFT_FIRST_FLIES, luckyMultiplier: null }
        : {
            amount: Math.floor(
              shopGiftBaseFlies(preview.balance) *
                (preview.premium ? preview.config.plusMultiplier : 1),
            ),
            luckyMultiplier:
              preview.config.luckyChancePercent > 0 ? preview.config.luckyMultiplier : null,
          }
      : {}),
  };
}
