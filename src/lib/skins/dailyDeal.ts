import {
  isTradeOnlyRarity,
  RARITY_ORDER,
  rarityRank,
  type ItemDef,
  type Rarity,
} from './catalog';
import { isAvailableAt } from './availability';
import {
  DEFAULT_SHOP_SALES,
  SHOP_TIERS,
  discountPercentFor,
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

function tierPlan(config: ShopSalesConfig, rand: () => number): Rarity[] {
  const slots = Math.max(1, Math.floor(config.slots));
  const plan: Rarity[] = [];
  const affordable = Math.max(0, Math.floor(config.affordableSlots));
  for (let i = 0; i < affordable; i++) {
    plan.push(rand() * 100 < config.commonWeightPercent ? 'common' : 'uncommon');
  }
  for (let i = 0; i < Math.max(0, Math.floor(config.rareSlots)); i++) {
    plan.push('rare');
  }
  for (let i = 0; i < Math.max(0, Math.floor(config.epicSlots)); i++) {
    plan.push('epic');
  }
  // A tier count that doesn't add up to the slot count tops up from the cheap
  // end rather than shrinking the storefront.
  while (plan.length < slots) {
    plan.push(rand() * 100 < config.commonWeightPercent ? 'common' : 'uncommon');
  }
  return plan.slice(0, slots);
}

export type ShopRotationInput = {
  catalog: ItemDef[];
  now?: Date;
  timezone?: string;
  config?: ShopSalesConfig;
  rerollCount?: number;
  /** Item ids the player already owns — never shown, a wasted slot otherwise. */
  ownedIds?: Iterable<string>;
  /** Un-owned item ids the player pinned, newest first. */
  wishlistItemIds?: readonly string[];
};

/**
 * Today's storefront: a fixed rarity composition so there is always something
 * buyable now and something to save toward, with a minority of the slots
 * discounted. Legendaries never appear — they are trade-only.
 *
 * Personal by design: owned items are filtered out and one slot is reserved for
 * something the player pinned, so the shelf is never padded with things they
 * can't or wouldn't buy.
 */
export function getShopRotation({
  catalog,
  now = new Date(),
  timezone = 'UTC',
  config = DEFAULT_SHOP_SALES,
  rerollCount = 0,
  ownedIds,
  wishlistItemIds = [],
}: ShopRotationInput): DailyDeal[] {
  const owned = new Set(ownedIds ?? []);
  const eligible = catalog.filter(
    (item) =>
      item.slot !== 'container' &&
      !isTradeOnlyRarity(item.rarity) &&
      (item.priceFlies ?? 0) > 0 &&
      !owned.has(item.id) &&
      isAvailableAt(item, now),
  );
  if (eligible.length === 0) return [];

  const { dayKey, endsAt, weekday } = shopDay(now, timezone, config);
  const roll = rerollCount > 0 ? `:r${rerollCount}` : '';
  const seed = `${dayKey}${roll}`;
  const weekend = weekday === config.weekendDay;

  // Each tier's items ranked for today, so a slot that draws a tier just takes
  // the next unused item off that list.
  const queues = new Map<Rarity, ItemDef[]>();
  for (const rarity of RARITY_ORDER) {
    queues.set(
      rarity,
      eligible
        .filter((item) => item.rarity === rarity)
        .map((item) => ({
          item,
          rank: hashString(`shop:${seed}:${rarity}:${item.id}`),
        }))
        .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
        .map(({ item }) => item),
    );
  }

  const cursors = new Map<Rarity, number>(RARITY_ORDER.map((r) => [r, 0]));
  const takeFrom = (rarity: Rarity): ItemDef | null => {
    const queue = queues.get(rarity) ?? [];
    const at = cursors.get(rarity) ?? 0;
    if (at >= queue.length) return null;
    cursors.set(rarity, at + 1);
    return queue[at];
  };
  /** Exhausted tier: walk down to the cheaper ones first, then up. */
  const take = (rarity: Rarity): ItemDef | null => {
    const direct = takeFrom(rarity);
    if (direct) return direct;
    const below = SHOP_TIERS.filter((r) => rarityRank[r] < rarityRank[rarity]);
    for (const fallback of [...below].reverse()) {
      const item = takeFrom(fallback);
      if (item) return item;
    }
    for (const fallback of SHOP_TIERS.filter(
      (r) => rarityRank[r] > rarityRank[rarity],
    )) {
      const item = takeFrom(fallback);
      if (item) return item;
    }
    return null;
  };

  const rand = mulberry32(hashString(`shop-slots:${seed}`));
  const picks: ItemDef[] = [];
  for (const rarity of tierPlan(config, rand)) {
    const item = take(rarity);
    if (!item) break;
    picks.push(item);
  }
  if (picks.length === 0) return [];

  picks.sort(
    (a, b) =>
      hashString(`shop-order:${seed}:${a.id}`) -
      hashString(`shop-order:${seed}:${b.id}`),
  );

  // The reserved slot: an item they already told us they want. Which pin gets
  // it rotates by day, so a full wishlist doesn't park on one item forever.
  let wishlistIndex: number | null = null;
  if (config.wishlistSlot && wishlistItemIds.length > 0) {
    const onShelf = new Set(picks.map((item) => item.id));
    const byId = new Map(eligible.map((item) => [item.id, item]));
    const candidates = wishlistItemIds
      .map((id) => byId.get(id))
      .filter((item): item is ItemDef => !!item);
    const already = candidates.find((item) => onShelf.has(item.id));
    if (already) {
      wishlistIndex = picks.findIndex((item) => item.id === already.id);
    } else if (candidates.length > 0) {
      const chosen =
        candidates[hashString(`shop-wishlist:${seed}`) % candidates.length];
      const sameTier = picks.findIndex((item) => item.rarity === chosen.rarity);
      wishlistIndex = sameTier >= 0 ? sameTier : picks.length - 1;
      picks[wishlistIndex] = chosen;
    }
  }

  const saleRand = mulberry32(hashString(`shop-sale:${seed}`));
  const wanted = Math.max(
    0,
    Math.min(
      picks.length,
      Math.floor(weekend ? config.weekendDiscountedSlots : config.discountedSlots),
    ),
  );
  const onSale = new Set<number>();
  const add = (index: number) => {
    if (index >= 0 && onSale.size < wanted) onSale.add(index);
  };

  if (wishlistIndex !== null) {
    const pinned = picks[wishlistIndex];
    const chance =
      hashString(`shop-wishlist-sale:${seed}:${pinned.id}`) / 0x100000000;
    if (chance * 100 < config.wishlistDealChancePercent) add(wishlistIndex);
  }

  // Rarest first: a discount on an epic is the "check the shop today" moment,
  // and it only earns that by being rare. The cheap tiers backfill whatever is
  // left, which is what keeps a buyable discount on the shelf every day.
  for (const rarity of [...SHOP_TIERS].reverse()) {
    if (onSale.size >= wanted) break;
    const days = config.raritySaleDaysPercent[rarity] ?? 0;
    if (days >= 100) continue;
    if (saleRand() * 100 >= days) continue;
    const free = (i: number) => !onSale.has(i) && picks[i].rarity === rarity;
    // The reserved slot has its own rate; a tier roll only lands on it when
    // there is no other slot of that tier to mark down.
    const spare = picks.findIndex((_, i) => free(i) && i !== wishlistIndex);
    add(spare >= 0 ? spare : picks.findIndex((_, i) => free(i)));
  }

  if (weekend) {
    const chosen = Array.from(onSale);
    const hasHeadline = chosen.some(
      (i) => rarityRank[picks[i].rarity] >= rarityRank.rare,
    );
    if (!hasHeadline) {
      const index = picks.findIndex(
        (item) => rarityRank[item.rarity] >= rarityRank.rare,
      );
      if (index >= 0) {
        if (onSale.size >= wanted) onSale.delete(chosen[chosen.length - 1]);
        add(index);
      }
    }
  }

  // Cheapest first, so the slot that fills out the day's discounts is the one
  // anyone can act on. The reserved slot sits last: its markdown rate is the
  // wishlist chance above, and letting the backfill reach it would quietly
  // discount a pin most days and turn the alert into noise.
  const backfill = picks
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !onSale.has(index))
    .sort(
      (a, b) =>
        Number(a.index === wishlistIndex) - Number(b.index === wishlistIndex) ||
        rarityRank[a.item.rarity] - rarityRank[b.item.rarity] ||
        hashString(`shop-backfill:${seed}:${a.item.id}`) -
          hashString(`shop-backfill:${seed}:${b.item.id}`),
    );
  for (const { index } of backfill) {
    if (onSale.size >= wanted) break;
    add(index);
  }

  return picks.map((item, index) => {
    const price = item.priceFlies ?? 0;
    const sale = onSale.has(index);
    const dealPrice = sale
      ? computeDealPrice(
          price,
          discountPercentFor(config, item.rarity, weekend) / 100,
        )
      : price;
    return {
      itemId: item.id,
      priceFlies: price,
      dealPrice,
      discountPercent:
        price > 0 ? Math.round(((price - dealPrice) / price) * 100) : 0,
      onSale: sale && dealPrice < price,
      wishlistSlot: index === wishlistIndex,
      endsAt,
    };
  });
}

export { rerollsAllowed };
