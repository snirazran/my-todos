import type { ItemDef } from './catalog';

export const DAILY_DEAL_DISCOUNT = 0.25;
export const DAILY_DEAL_COUNT = 8;
const MIN_DEAL_PRICE_FLIES = 200;

export type DailyDeal = {
  itemId: string;
  priceFlies: number;
  dealPrice: number;
  endsAt: string;
};

export function isPremiumActive(premiumUntil?: Date | string | null): boolean {
  return premiumUntil ? new Date(premiumUntil) > new Date() : false;
}

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function computeDealPrice(priceFlies: number): number {
  const discounted = priceFlies * (1 - DAILY_DEAL_DISCOUNT);
  return Math.max(10, Math.round(discounted / 10) * 10);
}

export function getDailyDeals(
  catalog: ItemDef[],
  now: Date = new Date(),
  count: number = DAILY_DEAL_COUNT,
): DailyDeal[] {
  const eligible = catalog.filter(
    (i) =>
      i.slot !== 'container' && (i.priceFlies ?? 0) >= MIN_DEAL_PRICE_FLIES,
  );
  if (eligible.length === 0) return [];

  const dayKey = utcDayKey(now);
  const picks = eligible
    .map((item) => ({
      item,
      rank: hashString(`daily-deal:${dayKey}:${item.id}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .slice(0, count);

  const endsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();

  return picks.map(({ item }) => {
    const price = item.priceFlies ?? 0;
    return {
      itemId: item.id,
      priceFlies: price,
      dealPrice: computeDealPrice(price),
      endsAt,
    };
  });
}
