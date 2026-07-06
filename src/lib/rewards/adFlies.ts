export const AD_FLY_REWARD = 10;
export const AD_FLY_DAILY_CAP = 5;

export type AdFlyDaily = {
  date: string;
  count: number;
};

export function adFliesRemaining(daily: AdFlyDaily | undefined, today: string) {
  if (!daily || daily.date !== today) return AD_FLY_DAILY_CAP;
  return Math.max(0, AD_FLY_DAILY_CAP - daily.count);
}
