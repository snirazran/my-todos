import { shopDay } from '@/lib/skins/dailyDeal';
import type { ShopSalesConfig } from '@/lib/skins/shopSales';
import type { FlyEconomyConfig } from './defaults';
import { economyDayKey, economyTimezoneFor, type EconomyTimezoneUser } from './guards';
import { fliesGrantedOnDay } from './ledger';
import { shopGiftStatus, type ShopGiftStatus } from './shopGift';

export async function shopGiftHeadroom(
  userId: string,
  timezone: string,
  economy: FlyEconomyConfig,
): Promise<number> {
  const granted = await fliesGrantedOnDay(userId, economyDayKey(timezone));
  return Math.max(0, economy.circuitBreaker.dailyCap - granted);
}

export async function loadShopGiftStatus({
  userId,
  user,
  claimedDayKey,
  requestedTimezone,
  salesConfig,
  economy,
  balance,
  premium,
}: {
  userId: string;
  user: EconomyTimezoneUser;
  claimedDayKey: string | undefined;
  requestedTimezone: string;
  salesConfig: ShopSalesConfig;
  economy: FlyEconomyConfig;
  balance: number;
  premium: boolean;
}): Promise<ShopGiftStatus> {
  const { zone } = economyTimezoneFor(
    user,
    requestedTimezone,
    economy.timezone.changesPerDay,
  );
  const shop = shopDay(new Date(), zone, salesConfig);
  const open =
    economy.shopGift.enabled &&
    claimedDayKey !== shop.dayKey &&
    (await shopGiftHeadroom(userId, zone, economy)) > 0;
  return shopGiftStatus(claimedDayKey, shop, open, {
    balance,
    premium,
    config: economy.shopGift,
  });
}
