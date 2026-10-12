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

export const SHOP_GIFT_MIN_FLIES = 25;
export const SHOP_GIFT_MAX_FLIES = 100;
export const SHOP_GIFT_STEP = 5;
export const SHOP_GIFT_FIRST_FLIES = 150;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shopGiftBaseFlies(userId: string, dayKey: string): number {
  const steps = (SHOP_GIFT_MAX_FLIES - SHOP_GIFT_MIN_FLIES) / SHOP_GIFT_STEP + 1;
  return SHOP_GIFT_MIN_FLIES + (hashSeed(`${userId}:${dayKey}`) % steps) * SHOP_GIFT_STEP;
}

export function rollShopGift(
  userId: string,
  dayKey: string,
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
  const base = shopGiftBaseFlies(userId, dayKey);
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
  preview?: { userId: string; premium: boolean; config: ShopGiftConfig },
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
              shopGiftBaseFlies(preview.userId, shop.dayKey) *
                (preview.premium ? preview.config.plusMultiplier : 1),
            ),
            luckyMultiplier:
              preview.config.luckyChancePercent > 0 ? preview.config.luckyMultiplier : null,
          }
      : {}),
  };
}
