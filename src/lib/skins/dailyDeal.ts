import {
  isTradeOnlyRarity,
  RARITY_ORDER,
  type ItemDef,
  type Rarity,
} from './catalog';
import { isAvailableAt } from './availability';
import { zonedToUtc } from '@/lib/calendar/time';
import { getZonedYMD } from '@/lib/utils';

/**
 * Each deal rolls its own discount inside this band, so a shelf reads as a set
 * of individual finds rather than one blanket sale.
 *
 * The ceiling is the load-bearing number: trade-up is meant to sit ~30–45%
 * below buying ("costs more, but you pick the item"). Let a deal reach 30%+
 * and buying the exact skin becomes cheaper than the random trade-up, which
 * inverts the whole mechanic. 25% keeps trade-up strictly the cheaper path.
 * The floor is 10% because anything under that reads as no discount at all.
 */
export const DAILY_DEAL_MIN_DISCOUNT = 0.1;
export const DAILY_DEAL_MAX_DISCOUNT = 0.25;

export const DAILY_DEAL_SLOTS = 6;

/**
 * How often a single item of each rarity should get a purchase window,
 * relative to a common. A legendary gets ~a third the sale days of a common.
 *
 * This replaces a fixed per-rarity quota, which inverted the rarity ladder:
 * with 5 legendaries in the catalog, "2 legendaries every day" put 40% of them
 * on sale daily while a common sat at 5% — the rarest, most expensive tier had
 * the MOST purchase windows, so nobody would ever pay full price for one.
 *
 * Weights are derived from this times the live catalog counts, so the shelf
 * stays balanced on its own as the catalog grows tier by tier.
 */
export const DAILY_DEAL_RARITY_EXPOSURE: Record<Rarity, number> = {
  common: 1,
  uncommon: 0.78,
  rare: 0.58,
  epic: 0.47,
  legendary: 0.35,
};

function rarityWeights(pool: ItemDef[]): Record<Rarity, number> {
  const counts = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  } as Record<Rarity, number>;
  for (const item of pool) counts[item.rarity] += 1;
  const weights = {} as Record<Rarity, number>;
  for (const rarity of RARITY_ORDER) {
    weights[rarity] = counts[rarity] * DAILY_DEAL_RARITY_EXPOSURE[rarity];
  }
  return weights;
}

function pickRarity(t: number, weights: Record<Rarity, number>): Rarity | null {
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  if (total <= 0) return null;
  let roll = t * total;
  for (const rarity of RARITY_ORDER) {
    roll -= weights[rarity];
    if (roll <= 0) return rarity;
  }
  return RARITY_ORDER.find((r) => weights[r] > 0) ?? null;
}

/**
 * FNV over `seed:0`, `seed:1`… leaves neighbouring slot draws correlated, which
 * clustered legendaries onto the same few days. Seed a real PRNG once per
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
 * Rerolls a Plus member gets per day. Each reroll swaps the whole shelf, so
 * this is deliberately small — 2 rerolls already exposes ~3x the daily slice
 * of the catalog, and more starts eroding the scarcity deals depend on.
 */
export const DAILY_DEAL_REROLLS = 2;

export type DealReroll = {
  /** Zoned day key the count belongs to. */
  date: string;
  count: number;
};

export function rerollsUsed(reroll: DealReroll | undefined, today: string) {
  if (!reroll || reroll.date !== today) return 0;
  return Math.max(0, Math.min(DAILY_DEAL_REROLLS, reroll.count));
}

export function rerollsLeft(reroll: DealReroll | undefined, today: string) {
  return DAILY_DEAL_REROLLS - rerollsUsed(reroll, today);
}

export type DailyDeal = {
  itemId: string;
  priceFlies: number;
  dealPrice: number;
  /** Effective discount after rounding — what the UI should display. */
  discountPercent: number;
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

/**
 * Prices stay legible by snapping to a step that scales with magnitude — a
 * 18,000 legendary shouldn't advertise 13,486.
 */
function roundingStep(priceFlies: number): number {
  if (priceFlies >= 1000) return 10;
  if (priceFlies >= 200) return 5;
  return 1;
}

export function computeDealPrice(
  priceFlies: number,
  discount: number = DAILY_DEAL_MIN_DISCOUNT,
): number {
  const step = roundingStep(priceFlies);
  const target = priceFlies * (1 - discount);
  const snapped = Math.floor(target / step) * step;
  // Always strictly cheaper: on small prices the snap can otherwise land back
  // on the full price and advertise a 0% "deal".
  return Math.max(1, Math.min(snapped, priceFlies - step));
}

/** Deterministic discount for one item on one day/reroll. */
function discountFor(seed: string): number {
  const t = hashString(seed) / 0x100000000;
  return (
    DAILY_DEAL_MIN_DISCOUNT +
    t * (DAILY_DEAL_MAX_DISCOUNT - DAILY_DEAL_MIN_DISCOUNT)
  );
}

/**
 * The day's discounted shelf. Deliberately a pure function of
 * (day, reroll, catalog) with no user id: at reroll 0 every player sees the
 * same shelf, which is what makes "did you see today's deals?" a conversation
 * between friends. Rerolling (a Plus perk) is what makes it personal.
 */
export function getDailyDeals(
  catalog: ItemDef[],
  now: Date = new Date(),
  timezone: string = 'UTC',
  rerollCount: number = 0,
  slots: number = DAILY_DEAL_SLOTS,
): DailyDeal[] {
  const eligible = catalog.filter(
    (item) =>
      item.slot !== 'container' &&
      !isTradeOnlyRarity(item.rarity) &&
      (item.priceFlies ?? 0) > 0 &&
      isAvailableAt(item, now),
  );
  if (eligible.length === 0) return [];

  const dayKey = getZonedYMD(now, timezone);
  const roll = rerollCount > 0 ? `:r${rerollCount}` : '';

  // Each rarity's items ranked for today, so a slot that draws a rarity just
  // takes the next unused item off that list.
  const queues = new Map<Rarity, ItemDef[]>();
  for (const rarity of RARITY_ORDER) {
    queues.set(
      rarity,
      eligible
        .filter((item) => item.rarity === rarity)
        .map((item) => ({
          item,
          rank: hashString(`daily-deal:${dayKey}${roll}:${rarity}:${item.id}`),
        }))
        .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
        .map(({ item }) => item),
    );
  }

  const cursors = new Map<Rarity, number>(RARITY_ORDER.map((r) => [r, 0]));
  const take = (rarity: Rarity): ItemDef | null => {
    const queue = queues.get(rarity) ?? [];
    const at = cursors.get(rarity) ?? 0;
    if (at >= queue.length) return null;
    cursors.set(rarity, at + 1);
    return queue[at];
  };

  const weights = rarityWeights(eligible);
  const rand = mulberry32(hashString(`daily-deal-slots:${dayKey}${roll}`));
  const picks: ItemDef[] = [];
  const target = Math.min(slots, eligible.length);
  while (picks.length < target) {
    const rarity = pickRarity(rand(), weights);
    let item = rarity ? take(rarity) : null;
    if (!item) {
      // That rarity is exhausted for today — fall through the ladder rather
      // than shrinking the shelf.
      for (const fallback of RARITY_ORDER) {
        item = take(fallback);
        if (item) break;
      }
    }
    if (!item) break;
    picks.push(item);
  }

  picks.sort(
    (a, b) =>
      hashString(`daily-deal-order:${dayKey}${roll}:${a.id}`) -
      hashString(`daily-deal-order:${dayKey}${roll}:${b.id}`),
  );

  const endsAt = zonedToUtc(nextDayKey(dayKey), '00:00', timezone).toISOString();

  return picks.map((item) => {
    const price = item.priceFlies ?? 0;
    const dealPrice = computeDealPrice(
      price,
      discountFor(`daily-deal-discount:${dayKey}${roll}:${item.id}`),
    );
    return {
      itemId: item.id,
      priceFlies: price,
      dealPrice,
      discountPercent:
        price > 0 ? Math.round(((price - dealPrice) / price) * 100) : 0,
      endsAt,
    };
  });
}
