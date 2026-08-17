import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';

/** Client-side fallbacks; the server's admin config is the real number. */
export const AD_FLY_REWARD = FLY_ECONOMY_DEFAULTS.rewardedAds.reward;
export const AD_FLY_DAILY_CAP = FLY_ECONOMY_DEFAULTS.rewardedAds.dailyCap;

export type AdFlyDaily = {
  date: string;
  count: number;
  lastAt?: Date | string;
};

export function adFliesRemaining(
  daily: AdFlyDaily | undefined,
  today: string,
  cap: number = AD_FLY_DAILY_CAP,
) {
  if (!daily || daily.date !== today) return cap;
  return Math.max(0, cap - daily.count);
}
