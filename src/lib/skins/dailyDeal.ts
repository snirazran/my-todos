import { RARITY_ORDER, type ItemDef } from './catalog';
import { zonedToUtc } from '@/lib/calendar/time';
import { getZonedYMD } from '@/lib/utils';

export const DAILY_DEAL_DISCOUNT = 0.25;
export const DAILY_DEALS_PER_RARITY = 2;
export const DAILY_DEAL_COUNT = RARITY_ORDER.length * DAILY_DEALS_PER_RARITY;

export type DailyDeal = {
  itemId: string;
  priceFlies: number;
  dealPrice: number;
  endsAt: string;
};

export function isPremiumActive(premiumUntil?: Date | string | null): boolean {
  return premiumUntil ? new Date(premiumUntil) > new Date() : false;
}

function nextDayKey(dayKey: string): string {
  const day = new Date(`${dayKey}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
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
  timezone: string = 'UTC',
  dealsPerRarity: number = DAILY_DEALS_PER_RARITY,
): DailyDeal[] {
  const eligible = catalog.filter(
    (item) => item.slot !== 'container' && (item.priceFlies ?? 0) > 0,
  );
  if (eligible.length === 0) return [];

  const dayKey = getZonedYMD(now, timezone);
  const rankedByRarity = new Map<ItemDef['rarity'], ItemDef[]>();
  for (const rarity of RARITY_ORDER) {
    rankedByRarity.set(
      rarity,
      eligible
        .filter((item) => item.rarity === rarity)
        .map((item) => ({
          item,
          rank: hashString(`daily-deal:${dayKey}:${rarity}:${item.id}`),
        }))
        .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
        .slice(0, dealsPerRarity)
        .map(({ item }) => item),
    );
  }

  const picks = RARITY_ORDER.flatMap(
    (rarity) => rankedByRarity.get(rarity) ?? [],
  )
    .map((item) => ({
      item,
      rank: hashString(`daily-deal-order:${dayKey}:${item.id}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .map(({ item }) => item);

  const endsAt = zonedToUtc(nextDayKey(dayKey), '00:00', timezone).toISOString();

  return picks.map((item) => {
    const price = item.priceFlies ?? 0;
    return {
      itemId: item.id,
      priceFlies: price,
      dealPrice: computeDealPrice(price),
      endsAt,
    };
  });
}
