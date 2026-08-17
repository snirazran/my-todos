import { RARITY_ORDER, rarityRank, type Rarity } from './catalog';

/**
 * Everything about a gift reveal that is *not* the per-gift drop table: the one
 * shared Luck counter, how backgrounds are weighted inside a rarity band, and
 * the four duplicate rules. All admin-tunable from the Gift Manager.
 */
export type GiftRules = {
  /** Luck at which each further reveal starts adding legendary chance. */
  softPityLuck: number;
  /** Percentage points added per reveal once inside soft pity, cumulative. */
  softPityBonusPoints: number;
  /** Luck at which the next reveal is a guaranteed legendary. */
  hardPityLuck: number;
  /** Luck at which the next reveal is a guaranteed epic or better. */
  epicPityLuck: number;
  /** Share of a rarity band's draw that goes to a background rather than an item. */
  backgroundSharePercent: number;
  /** How much an un-owned candidate outweighs an owned one in the draw. */
  newFirstWeight: number;
  /** Chance the identity is taken from un-owned wishlisted prizes of the band. */
  wishlistRedirectPercent: number;
  /** Owning every prize of a low band upgrades the drop one tier. */
  tierBumpEnabled: boolean;
};

export const DEFAULT_GIFT_RULES: GiftRules = {
  softPityLuck: 250,
  softPityBonusPoints: 2,
  hardPityLuck: 350,
  epicPityLuck: 120,
  backgroundSharePercent: 22,
  newFirstWeight: 3,
  wishlistRedirectPercent: 50,
  tierBumpEnabled: true,
};

export const GIFT_RULE_LIMITS: Record<
  Exclude<keyof GiftRules, 'tierBumpEnabled'>,
  { min: number; max: number }
> = {
  softPityLuck: { min: 0, max: 10_000 },
  softPityBonusPoints: { min: 0, max: 100 },
  hardPityLuck: { min: 1, max: 10_000 },
  epicPityLuck: { min: 1, max: 10_000 },
  backgroundSharePercent: { min: 0, max: 100 },
  newFirstWeight: { min: 1, max: 20 },
  wishlistRedirectPercent: { min: 0, max: 100 },
};

/**
 * Only the two bands a collector genuinely finishes. Bumping a completed rare
 * band would hand out epics for free, which is the opposite of the problem the
 * rule exists to solve.
 */
export const TIER_BUMP_RARITIES: readonly Rarity[] = ['common', 'uncommon'];

/** Luck a reveal is worth, by the rarity of the gift box itself. */
export const DEFAULT_LUCK_PER_REVEAL: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 5,
  legendary: 8,
};

/**
 * The published ladder: roughly 1 : 2 : 4.5 in expected value, keyed by the
 * rarity of the gift box. Percentages, so they read the same as the odds sheet.
 */
export const RECOMMENDED_RARITY_TABLES: Record<
  Rarity,
  Record<Rarity, number>
> = {
  common: { common: 62, uncommon: 28, rare: 8.5, epic: 1.4, legendary: 0.1 },
  uncommon: { common: 46, uncommon: 32, rare: 16.5, epic: 5, legendary: 0.5 },
  rare: { common: 30, uncommon: 36, rare: 25, epic: 8, legendary: 1 },
  epic: { common: 15, uncommon: 28, rare: 34, epic: 20, legendary: 3 },
  legendary: { common: 5, uncommon: 20, rare: 40, epic: 30, legendary: 5 },
};

export function clampGiftRules(input: unknown): GiftRules {
  const src = (input ?? {}) as Partial<Record<keyof GiftRules, unknown>>;
  const num = (key: Exclude<keyof GiftRules, 'tierBumpEnabled'>) => {
    const { min, max } = GIFT_RULE_LIMITS[key];
    const value = Number(src[key]);
    if (!Number.isFinite(value)) return DEFAULT_GIFT_RULES[key];
    return Math.min(max, Math.max(min, value));
  };
  return {
    softPityLuck: num('softPityLuck'),
    softPityBonusPoints: num('softPityBonusPoints'),
    hardPityLuck: num('hardPityLuck'),
    epicPityLuck: num('epicPityLuck'),
    backgroundSharePercent: num('backgroundSharePercent'),
    newFirstWeight: num('newFirstWeight'),
    wishlistRedirectPercent: num('wishlistRedirectPercent'),
    tierBumpEnabled:
      src.tierBumpEnabled === undefined
        ? DEFAULT_GIFT_RULES.tierBumpEnabled
        : !!src.tierBumpEnabled,
  };
}

/**
 * One counter, every reveal. `luck` runs to the legendary guarantee and only a
 * legendary clears it; `epicLuck` runs the shorter epic guarantee and any epic+
 * clears it. `softSteps` is how many reveals have already been spent inside
 * soft pity, which is what makes the bonus cumulative.
 */
export type GiftLuckState = {
  luck: number;
  epicLuck: number;
  softSteps: number;
};

export const EMPTY_GIFT_LUCK: GiftLuckState = {
  luck: 0,
  epicLuck: 0,
  softSteps: 0,
};

export function readGiftLuck(raw: unknown): GiftLuckState {
  const src = (raw ?? {}) as Partial<Record<keyof GiftLuckState, unknown>>;
  const int = (value: unknown) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    luck: int(src.luck),
    epicLuck: int(src.epicLuck),
    softSteps: int(src.softSteps),
  };
}

export function luckPerReveal(
  configured: number | undefined,
  giftRarity: Rarity,
): number {
  const n = Number(configured);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_LUCK_PER_REVEAL[giftRarity] ?? 1;
}

export type PityKind = 'table' | 'soft_pity' | 'epic_pity' | 'hard_pity';

export type GiftRarityRoll = {
  rarity: Rarity;
  pity: PityKind;
  /** Percentage points soft pity added to legendary on this roll. */
  bonusPoints: number;
};

function weightedPick<T>(entries: { value: T; weight: number }[]): T | null {
  const valid = entries.filter((entry) => entry.weight > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of valid) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return valid[valid.length - 1].value;
}

/**
 * Normalise the admin's weights to percentages, then let soft pity inflate
 * legendary at the expense of everything else proportionally, so the table
 * still sums to 100 and the other bands keep their relative shape.
 */
function adjustedPercentages(
  weights: Partial<Record<Rarity, number>>,
  usable: Rarity[],
  bonusPoints: number,
): Partial<Record<Rarity, number>> {
  const total = usable.reduce((sum, rarity) => sum + (weights[rarity] ?? 0), 0);
  if (total <= 0) return {};
  const pct: Partial<Record<Rarity, number>> = {};
  for (const rarity of usable) {
    pct[rarity] = ((weights[rarity] ?? 0) / total) * 100;
  }
  if (bonusPoints <= 0 || !usable.includes('legendary')) return pct;

  const basePct = pct.legendary ?? 0;
  const nextPct = Math.min(100, basePct + bonusPoints);
  const rest = 100 - basePct;
  const scale = rest > 0 ? (100 - nextPct) / rest : 0;
  const out: Partial<Record<Rarity, number>> = {};
  for (const rarity of usable) {
    out[rarity] =
      rarity === 'legendary' ? nextPct : (pct[rarity] ?? 0) * scale;
  }
  return out;
}

/**
 * Resolve which rarity band a reveal lands in. `available` is the set of bands
 * that actually have a prize to give — a band with nothing behind it is skipped
 * rather than returning an empty gift.
 */
export function rollGiftRarity({
  weights,
  available,
  luck,
  rules,
}: {
  weights: Partial<Record<Rarity, number>>;
  available: (rarity: Rarity) => boolean;
  luck: GiftLuckState;
  rules: GiftRules;
}): GiftRarityRoll | null {
  const usable = RARITY_ORDER.filter(
    (rarity) => available(rarity) && (weights[rarity] ?? 0) > 0,
  ) as Rarity[];

  if (luck.luck >= rules.hardPityLuck && available('legendary')) {
    return { rarity: 'legendary', pity: 'hard_pity', bonusPoints: 0 };
  }
  if (usable.length === 0) {
    // Nothing the table allows is stocked. Rather than fail the open, fall back
    // to any band that has prizes, cheapest first.
    const fallback = RARITY_ORDER.find((rarity) => available(rarity)) as
      | Rarity
      | undefined;
    return fallback
      ? { rarity: fallback, pity: 'table', bonusPoints: 0 }
      : null;
  }

  const inSoftPity = luck.luck >= rules.softPityLuck;
  const bonusPoints = inSoftPity
    ? rules.softPityBonusPoints * (luck.softSteps + 1)
    : 0;
  const pct = adjustedPercentages(weights, usable, bonusPoints);

  if (luck.epicLuck >= rules.epicPityLuck) {
    // A guarantee the table can veto is not a guarantee. Like hard pity, this
    // falls back to any stocked epic+ band when the gift itself weights none.
    const weighted = usable.filter(
      (rarity) => rarityRank[rarity] >= rarityRank.epic,
    );
    if (weighted.length > 0) {
      const rarity =
        weightedPick(
          weighted.map((entry) => ({ value: entry, weight: pct[entry] ?? 0 })),
        ) ?? weighted[0];
      return { rarity, pity: 'epic_pity', bonusPoints };
    }
    // The floor, not a jackpot: the cheapest stocked band that still clears it.
    const floor = RARITY_ORDER.find(
      (rarity) => rarityRank[rarity] >= rarityRank.epic && available(rarity),
    ) as Rarity | undefined;
    if (floor) return { rarity: floor, pity: 'epic_pity', bonusPoints };
  }

  const rarity = weightedPick(
    usable.map((entry) => ({ value: entry, weight: pct[entry] ?? 0 })),
  );
  if (!rarity) return null;
  return {
    rarity,
    pity: bonusPoints > 0 ? 'soft_pity' : 'table',
    bonusPoints,
  };
}

/**
 * The "I own every common and keep winning commons" escape hatch. Fires only on
 * a completed low band, and only ever one tier.
 */
export function applyTierBump({
  rarity,
  rules,
  hasUnowned,
  hasAny,
}: {
  rarity: Rarity;
  rules: GiftRules;
  hasUnowned: (rarity: Rarity) => boolean;
  hasAny: (rarity: Rarity) => boolean;
}): Rarity {
  if (!rules.tierBumpEnabled) return rarity;
  if (!TIER_BUMP_RARITIES.includes(rarity)) return rarity;
  if (hasUnowned(rarity)) return rarity;
  const next = RARITY_ORDER[rarityRank[rarity] + 1] as Rarity | undefined;
  if (!next || !hasAny(next)) return rarity;
  return next;
}

export type GiftPrizeLike = {
  id: string;
  kind: 'item' | 'background';
  rarity: Rarity;
};

export type BandCandidate<T extends GiftPrizeLike> = {
  prize: T;
  /** The table's own weight for this prize, before duplicate weighting. */
  weight: number;
};

export const giftPrizeKey = (prize: GiftPrizeLike) =>
  `${prize.kind}:${prize.id}`;

/**
 * Un-owned candidates outweigh owned ones so new items dominate the draw while
 * any remain — duplicates still happen, because they're the trade fuel.
 */
function drawWithinBand<T extends GiftPrizeLike>(
  candidates: BandCandidate<T>[],
  owns: (prize: T) => boolean,
  newFirstWeight: number,
): T | null {
  return weightedPick(
    candidates.map((candidate) => ({
      value: candidate.prize,
      weight:
        candidate.weight *
        (owns(candidate.prize) ? 1 : Math.max(1, newFirstWeight)),
    })),
  );
}

export type GiftIdentityPick<T extends GiftPrizeLike> = {
  prize: T;
  viaWishlist: boolean;
};

/**
 * Draw the identity inside a resolved band. The wishlist gets first refusal —
 * the one targeted route to a legendary — then backgrounds take their configured
 * share of the band (they're higher-impact and rarer than a hat, so they should
 * feel like a better-than-average outcome at the same tier), then new-first
 * weighting decides among what's left.
 *
 * `applyBackgroundShare` is off for hand-authored per-item tables: the admin
 * already said exactly how much each prize is worth.
 */
export function pickGiftIdentity<T extends GiftPrizeLike>({
  candidates,
  owns,
  wishlistKeys,
  rules,
  applyBackgroundShare,
}: {
  candidates: BandCandidate<T>[];
  owns: (prize: T) => boolean;
  wishlistKeys: Set<string>;
  rules: GiftRules;
  applyBackgroundShare: boolean;
}): GiftIdentityPick<T> | null {
  if (candidates.length === 0) return null;

  const wishlisted = candidates.filter(
    (candidate) =>
      wishlistKeys.has(giftPrizeKey(candidate.prize)) && !owns(candidate.prize),
  );
  if (
    wishlisted.length > 0 &&
    Math.random() * 100 < rules.wishlistRedirectPercent
  ) {
    const prize = drawWithinBand(wishlisted, owns, rules.newFirstWeight);
    if (prize) return { prize, viaWishlist: true };
  }

  let pool = candidates;
  if (applyBackgroundShare) {
    const backgrounds = candidates.filter(
      (candidate) => candidate.prize.kind === 'background',
    );
    const items = candidates.filter(
      (candidate) => candidate.prize.kind === 'item',
    );
    if (backgrounds.length > 0 && items.length > 0) {
      pool =
        Math.random() * 100 < rules.backgroundSharePercent
          ? backgrounds
          : items;
    }
  }

  const prize = drawWithinBand(pool, owns, rules.newFirstWeight);
  return prize ? { prize, viaWishlist: false } : null;
}

/** Roll the counters forward for one reveal, then clear what this prize clears. */
export function advanceGiftLuck({
  luck,
  rules,
  perReveal,
  resolved,
}: {
  luck: GiftLuckState;
  rules: GiftRules;
  perReveal: number;
  resolved: Rarity;
}): GiftLuckState {
  const inSoftPity = luck.luck >= rules.softPityLuck;
  return clearGiftLuck(
    {
      luck: luck.luck + perReveal,
      epicLuck: luck.epicLuck + perReveal,
      softSteps: inSoftPity ? luck.softSteps + 1 : 0,
    },
    resolved,
  );
}

/**
 * A legendary from *any* source clears the legendary counter, and any epic+
 * clears the epic one — otherwise a trade-up legendary would be followed
 * straight away by a pity legendary from a gift.
 */
export function clearGiftLuck(
  state: GiftLuckState,
  rarity: Rarity,
): GiftLuckState {
  const next = { ...state };
  if (rarity === 'legendary') {
    next.luck = 0;
    next.softSteps = 0;
  }
  if (rarityRank[rarity] >= rarityRank.epic) next.epicLuck = 0;
  return next;
}
