import {
  isTradeOnlyRarity,
  rarityRank,
  type ItemDef,
  type Rarity,
} from './catalog';
import { isAvailableAt } from './availability';
import {
  DEFAULT_SHOP_SALES,
  SHOP_TIERS,
  rerollsAllowed,
  type ShopSalesConfig,
} from './shopSales';
import { zonedToUtc } from '@/lib/calendar/time';
import { getZonedYMD } from '@/lib/utils';

export type DealReroll = {
  /** Shop day key the count belongs to. */
  date: string;
  count: number;
};

export function rerollsUsed(
  reroll: DealReroll | undefined,
  today: string,
  allowed: number,
) {
  if (!reroll || reroll.date !== today) return 0;
  return Math.max(0, Math.min(allowed, reroll.count));
}

export function rerollsLeft(
  reroll: DealReroll | undefined,
  today: string,
  allowed: number,
) {
  return allowed - rerollsUsed(reroll, today, allowed);
}

export type DailyDeal = {
  itemId: string;
  priceFlies: number;
  /** What the player pays today — equal to `priceFlies` when not on sale. */
  dealPrice: number;
  /** Effective discount after rounding — what the UI should display. */
  discountPercent: number;
  onSale: boolean;
  /** The slot reserved for something the player already pinned. */
  wishlistSlot: boolean;
  sale: boolean;
  plusOnly: boolean;
  endsAt: string;
};

export function isPremiumActive(premiumUntil?: Date | string | null): boolean {
  return premiumUntil ? new Date(premiumUntil) > new Date() : false;
}

function shiftDayKey(dayKey: string, days: number): string {
  const day = new Date(`${dayKey}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function zonedHour(now: Date, timezone: string): number {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
      10,
    );
  } catch {
    return now.getUTCHours();
  }
}

/**
 * The shelf rolls at 04:00 local, not midnight: someone still up at 1am is
 * finishing today, and swapping the shop out from under them reads as the deal
 * being yanked away rather than a new day starting.
 */
export function shopDay(
  now: Date,
  timezone: string,
  config: ShopSalesConfig = DEFAULT_SHOP_SALES,
) {
  const hour = Math.max(0, Math.min(23, Math.floor(config.refreshHour)));
  const calendarDay = getZonedYMD(now, timezone);
  const dayKey =
    zonedHour(now, timezone) < hour ? shiftDayKey(calendarDay, -1) : calendarDay;
  const endsAt = zonedToUtc(
    shiftDayKey(dayKey, 1),
    `${String(hour).padStart(2, '0')}:00`,
    timezone,
  ).toISOString();
  const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return { dayKey, endsAt, weekday };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * FNV over `seed:0`, `seed:1`… leaves neighbouring slot draws correlated, which
 * clustered rarities onto the same few days. Seed a real PRNG once per
 * (day, reroll) and pull the slots off it instead.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Prices stay legible by snapping to a step that scales with magnitude — a
 * 18,000 legendary shouldn't advertise 13,486.
 */
function roundingStep(priceFlies: number): number {
  if (priceFlies >= 1000) return 10;
  if (priceFlies >= 200) return 5;
  return 1;
}

export function computeDealPrice(priceFlies: number, discount: number): number {
  if (discount <= 0) return priceFlies;
  const step = roundingStep(priceFlies);
  const target = priceFlies * (1 - discount);
  // 650 × (1 − 0.30) is 454.99999999999994, which floors a whole step early and
  // advertises a 30% tier as 31% off. Absorb the float error before snapping.
  const snapped = Math.floor(target / step + 1e-6) * step;
  // Always strictly cheaper: on small prices the snap can otherwise land back
  // on the full price and advertise a 0% "deal".
  return Math.max(1, Math.min(snapped, priceFlies - step));
}

export function isShopBuyable(item: ItemDef, now: Date = new Date()): boolean {
  return (
    item.slot !== 'container' &&
    !isTradeOnlyRarity(item.rarity) &&
    (item.priceFlies ?? 0) > 0 &&
    isAvailableAt(item, now)
  );
}

export function isEverydayItem(
  item: Pick<ItemDef, 'id' | 'rarity'>,
  config: ShopSalesConfig = DEFAULT_SHOP_SALES,
): boolean {
  if (config.everydayRarities.includes(item.rarity)) return true;
  return (
    item.rarity === 'rare' &&
    hashString(`everyday:${item.id}`) % 100 < config.everydayRarePercent
  );
}

export function everydayItemIds(
  catalog: ItemDef[],
  config: ShopSalesConfig = DEFAULT_SHOP_SALES,
  now: Date = new Date(),
): string[] {
  return catalog
    .filter((item) => isShopBuyable(item, now) && isEverydayItem(item, config))
    .map((item) => item.id);
}

export type ShopRotationInput = {
  catalog: ItemDef[];
  now?: Date;
  timezone?: string;
  config?: ShopSalesConfig;
  rerollCount?: number;
  ownedIds?: Iterable<string>;
  wishlistItemIds?: readonly string[];
  isPlus?: boolean;
};

export function getShopRotation({
  catalog,
  now = new Date(),
  timezone = 'UTC',
  config = DEFAULT_SHOP_SALES,
  rerollCount = 0,
  ownedIds,
  wishlistItemIds = [],
  isPlus = false,
}: ShopRotationInput): DailyDeal[] {
  const owned = new Set(ownedIds ?? []);
  const eligible = catalog.filter(
    (item) => isShopBuyable(item, now) && !owned.has(item.id),
  );
  if (eligible.length === 0) return [];

  const { dayKey, endsAt } = shopDay(now, timezone, config);
  const roll = rerollCount > 0 ? `:r${rerollCount}` : '';
  const seed = `${dayKey}${roll}`;
  const ranked = (list: ItemDef[], key: string) =>
    list
      .map((item) => ({ item, rank: hashString(`${key}:${item.id}`) }))
      .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
      .map(({ item }) => item);

  const specialTier = (item: ItemDef) => rarityRank[item.rarity] >= rarityRank.rare;
  const inSpecial = (item: ItemDef) => specialTier(item) && !isEverydayItem(item, config);
  const special = eligible.filter(inSpecial);
  const borrowable = eligible.filter(
    (item) => rarityRank[item.rarity] >= rarityRank.uncommon && !inSpecial(item),
  );

  const salePool =
    [special, borrowable.filter(specialTier), borrowable].find((pool) => pool.length > 0) ?? [];
  const saleItem = ranked(salePool, `shop-sale:${dayKey}`)[0] ?? null;

  const queues = new Map<Rarity, ItemDef[]>();
  for (const rarity of SHOP_TIERS) {
    queues.set(
      rarity,
      ranked(
        special.filter((item) => item.rarity === rarity && item.id !== saleItem?.id),
        `shop:${seed}:${rarity}`,
      ),
    );
  }
  const fill = ranked(
    borrowable.filter((item) => item.id !== saleItem?.id),
    `shop-fill:${seed}`,
  ).sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity]);
  const take = (rarity: Rarity): ItemDef | null => {
    const order = [rarity, ...[...SHOP_TIERS].reverse().filter((tier) => tier !== rarity)];
    for (const tier of order) {
      const next = queues.get(tier)?.shift();
      if (next) return next;
    }
    return fill.shift() ?? null;
  };

  const free = Math.max(1, Math.floor(config.freeSlots));
  const total = free + Math.max(0, Math.floor(config.plusSlots));
  const rand = mulberry32(hashString(`shop-slots:${seed}`));
  const picks: ItemDef[] = [];
  const openSlots = saleItem ? total - 1 : total;
  const offsetSlots = saleItem ? 1 : 0;
  for (let i = 0; i < openSlots; i++) {
    const epicPercent =
      i + offsetSlots < free ? config.specialEpicPercent : config.plusEpicPercent;
    const item = take(rand() * 100 < epicPercent ? 'epic' : 'rare');
    if (!item) break;
    picks.push(item);
  }

  let wishlistIndex: number | null = null;
  const freeCount = Math.min(saleItem ? free - 1 : free, picks.length);
  if (config.wishlistSlot && wishlistItemIds.length > 0 && freeCount > 0) {
    const byId = new Map(special.map((item) => [item.id, item]));
    const candidates = wishlistItemIds
      .map((id) => byId.get(id))
      .filter((item): item is ItemDef => !!item && item.id !== saleItem?.id);
    const shelfIndex = (id: string) => picks.findIndex((item) => item.id === id);
    const already = candidates.find((item) => shelfIndex(item.id) >= 0);
    if (already) {
      const at = shelfIndex(already.id);
      if (at >= freeCount) {
        const swap = freeCount - 1;
        [picks[at], picks[swap]] = [picks[swap], picks[at]];
        wishlistIndex = swap;
      } else {
        wishlistIndex = at;
      }
    } else if (candidates.length > 0) {
      const chosen =
        candidates[hashString(`shop-wishlist:${seed}`) % candidates.length];
      const sameTier = picks.findIndex(
        (item, index) => index < freeCount && item.rarity === chosen.rarity,
      );
      wishlistIndex = sameTier >= 0 ? sameTier : freeCount - 1;
      picks[wishlistIndex] = chosen;
    }
  }

  const deals: DailyDeal[] = [];
  if (saleItem) {
    const price = saleItem.priceFlies ?? 0;
    const dealPrice = computeDealPrice(price, config.saleDiscountPercent / 100);
    deals.push({
      itemId: saleItem.id,
      priceFlies: price,
      dealPrice,
      discountPercent:
        price > 0 ? Math.round(((price - dealPrice) / price) * 100) : 0,
      onSale: isPlus && dealPrice < price,
      wishlistSlot: false,
      sale: true,
      plusOnly: false,
      endsAt,
    });
  }
  const offset = deals.length;
  picks.forEach((item, index) => {
    const price = item.priceFlies ?? 0;
    deals.push({
      itemId: item.id,
      priceFlies: price,
      dealPrice: price,
      discountPercent: 0,
      onSale: false,
      wishlistSlot: index === wishlistIndex,
      sale: false,
      plusOnly: index + offset >= free,
      endsAt,
    });
  });
  return deals;
}

export { rerollsAllowed };
