import { byId as staticById, rarityRank, type Rarity } from './catalog';

export type TradeRecipe = {
  from: Rarity;
  to: Rarity;
  itemCount: number;
  /** Tier the recipe also burns a couple of throwaways from, if any. */
  fuelRarity: Rarity | null;
  fuelCount: number;
  /** Cost to guarantee the output is a wishlisted item of the target tier. */
  aimPriceFlies: number;
};

export type TradeModifiers = {
  recipes: TradeRecipe[];
  /** Fuel dropped when every input is an item the player owns a spare of. */
  allSparesFuelWaived: number;
  /** Draw weighting an all-spares trade gets instead of the standard one. */
  allSparesNewFirstWeight: number;
  plusFuelWaived: number;
  /** Ceiling on the two waivers stacked. */
  maxFuelWaived: number;
  aimPlusDiscountPercent: number;
  goldenTradeChancePercent: number;
  goldenTradeRewardCount: number;
  /** How much an un-owned candidate outweighs an owned one in the draw. */
  newFirstWeight: number;
  wishlistRedirectPercent: number;
  wishlistSlotsFree: number;
  wishlistSlotsPlus: number;
};

export const DEFAULT_TRADE_RECIPES: TradeRecipe[] = [
  {
    from: 'common',
    to: 'uncommon',
    itemCount: 4,
    fuelRarity: null,
    fuelCount: 0,
    aimPriceFlies: 150,
  },
  {
    from: 'uncommon',
    to: 'rare',
    itemCount: 4,
    fuelRarity: null,
    fuelCount: 0,
    aimPriceFlies: 300,
  },
  {
    from: 'rare',
    to: 'epic',
    itemCount: 4,
    fuelRarity: 'uncommon',
    fuelCount: 2,
    aimPriceFlies: 700,
  },
  {
    from: 'epic',
    to: 'legendary',
    itemCount: 4,
    fuelRarity: 'rare',
    fuelCount: 2,
    aimPriceFlies: 1200,
  },
];

export const DEFAULT_TRADE_MODIFIERS: TradeModifiers = {
  recipes: DEFAULT_TRADE_RECIPES,
  allSparesFuelWaived: 1,
  allSparesNewFirstWeight: 5,
  plusFuelWaived: 1,
  maxFuelWaived: 2,
  aimPlusDiscountPercent: 25,
  goldenTradeChancePercent: 5,
  goldenTradeRewardCount: 2,
  newFirstWeight: 3,
  wishlistRedirectPercent: 50,
  wishlistSlotsFree: 4,
  wishlistSlotsPlus: 10,
};

export function recipeFor(
  modifiers: TradeModifiers,
  rarity: Rarity,
): TradeRecipe | null {
  return modifiers.recipes.find((recipe) => recipe.from === rarity) ?? null;
}

export type TradeFuelQuote = {
  baseCount: number;
  count: number;
  waived: number;
  allSparesWaived: number;
  plusWaived: number;
};

export function quoteTradeFuel({
  modifiers,
  recipe,
  allSpares,
  isPlus,
}: {
  modifiers: TradeModifiers;
  recipe: TradeRecipe | null;
  allSpares: boolean;
  isPlus: boolean;
}): TradeFuelQuote {
  const baseCount = recipe?.fuelRarity ? Math.max(0, recipe.fuelCount) : 0;
  const cap = Math.max(0, Math.min(modifiers.maxFuelWaived, baseCount));
  const allSparesWaived = allSpares
    ? Math.min(Math.max(0, modifiers.allSparesFuelWaived), cap)
    : 0;
  const plusWaived = isPlus
    ? Math.min(Math.max(0, modifiers.plusFuelWaived), cap - allSparesWaived)
    : 0;
  const waived = allSparesWaived + plusWaived;
  return {
    baseCount,
    count: baseCount - waived,
    waived,
    allSparesWaived,
    plusWaived,
  };
}

export type TradeAimQuote = {
  basePrice: number;
  price: number;
  discountPercent: number;
};

export function quoteAimPrice({
  modifiers,
  recipe,
  isPlus,
}: {
  modifiers: TradeModifiers;
  recipe: TradeRecipe | null;
  isPlus: boolean;
}): TradeAimQuote {
  const basePrice = Math.max(0, recipe?.aimPriceFlies ?? 0);
  const discountPercent = isPlus
    ? Math.max(0, Math.min(100, modifiers.aimPlusDiscountPercent))
    : 0;
  return {
    basePrice,
    price: Math.max(0, Math.round(basePrice * (1 - discountPercent / 100))),
    discountPercent,
  };
}

/**
 * An all-spares trade draws harder toward things the player doesn't own — a
 * quality bonus rather than a price cut, so it costs the economy nothing.
 */
export function tradeNewFirstWeight(
  modifiers: TradeModifiers,
  allSpares: boolean,
) {
  return allSpares
    ? Math.max(modifiers.newFirstWeight, modifiers.allSparesNewFirstWeight)
    : modifiers.newFirstWeight;
}

export function wishlistSlots(modifiers: TradeModifiers, isPlus: boolean) {
  return isPlus ? modifiers.wishlistSlotsPlus : modifiers.wishlistSlotsFree;
}

export type TradeCandidate = { rarity: Rarity; owned: number };

/**
 * Every copy the trade panel would let the player spend — items and
 * backgrounds alike, one entry per owned id. Shared so the tab badge and the
 * panel can never disagree about what counts as tradeable.
 *
 * Walks the *inventory*, not the catalogue: the summary endpoint ships only
 * the equipped and on-sale slice of the catalogue, so iterating it silently
 * dropped nearly every item the player actually owns. Ids missing from the
 * passed catalogue fall back to the static one.
 */
export function tradeCandidates({
  catalog = [],
  inventory,
  backgrounds = [],
  backgroundInventory = {},
  modifiers,
  skipBackgroundIds = [],
}: {
  catalog?: readonly { id: string; rarity: Rarity; slot?: string }[];
  inventory: Record<string, number> | null | undefined;
  backgrounds?: readonly { id: string; rarity: Rarity }[];
  backgroundInventory?: Record<string, number> | null;
  modifiers: TradeModifiers;
  skipBackgroundIds?: readonly string[];
}): TradeCandidate[] {
  const out: TradeCandidate[] = [];
  const skip = new Set(skipBackgroundIds);
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const backgroundById = new Map(
    backgrounds.map((background) => [background.id, background]),
  );

  for (const [id, count] of Object.entries(inventory ?? {})) {
    const owned = count ?? 0;
    if (owned <= 0) continue;
    const def = itemById.get(id) ?? staticById[id];
    if (!def) continue;
    if (def.slot === 'container') continue;
    if (!recipeFor(modifiers, def.rarity)) continue;
    out.push({ rarity: def.rarity, owned });
  }

  for (const [id, count] of Object.entries(backgroundInventory ?? {})) {
    const owned = count ?? 0;
    if (owned <= 0) continue;
    if (skip.has(id)) continue;
    const def = backgroundById.get(id);
    if (!def) continue;
    if (!recipeFor(modifiers, def.rarity)) continue;
    out.push({ rarity: def.rarity, owned });
  }

  return out;
}

export type TradeReadiness = {
  /** Contracts completable right now, spending each copy at most once. */
  trades: number;
  /** Cheapest tier with a completable contract, for the "start here" cue. */
  startRarity: Rarity | null;
  /** Contracts per starting tier, so a badge can explain its own number. */
  byRarity: Partial<Record<Rarity, number>>;
};

/** A stack of one owned id: how many copies are left, and whether it started
 * as a spare — the all-spares waiver keys off the original count, exactly as
 * the panel and the server do. */
type Stack = { rarity: Rarity; left: number; spare: boolean };

/**
 * Duplicates alone never answered "can I trade?" — a contract needs N copies of
 * *one* rarity plus its fuel, so the count is a greedy spend of the real pool
 * from the cheapest tier up.
 *
 * Costs are quoted the way the contract screen quotes them, per id rather than
 * per tier: deepest stacks are spent first (as Quick Fill does), and a contract
 * whose every input is a spare earns the duplicate waiver, stacking with the
 * Plus waiver up to the configured cap. Collapsing the pool to per-rarity
 * totals is what made the badge quote a number the contract screen disagreed
 * with — it always charged full fuel.
 */
export function countReadyTrades({
  candidates,
  modifiers,
  isPlus,
}: {
  candidates: readonly TradeCandidate[];
  modifiers: TradeModifiers;
  isPlus: boolean;
}): TradeReadiness {
  const stacks: Stack[] = candidates
    .filter((candidate) => candidate.owned > 0)
    .map((candidate) => ({
      rarity: candidate.rarity,
      left: candidate.owned,
      spare: candidate.owned >= 2,
    }));

  // Deepest first, so a one-of-a-kind copy is only burned as a last resort and
  // an all-spares contract is found whenever one exists.
  const deepestFirst = (rarity: Rarity) =>
    stacks
      .filter((stack) => stack.rarity === rarity && stack.left > 0)
      .sort((a, b) => b.left - a.left);

  /** Takes `need` copies without committing, so a contract that turns out to be
   * short on fuel doesn't half-spend the pool. */
  const plan = (rarity: Rarity, need: number) => {
    const picks: Stack[] = [];
    if (need <= 0) return picks;
    const taken = new Map<Stack, number>();
    for (const stack of deepestFirst(rarity)) {
      while (picks.length < need && (taken.get(stack) ?? 0) < stack.left) {
        taken.set(stack, (taken.get(stack) ?? 0) + 1);
        picks.push(stack);
      }
      if (picks.length >= need) break;
    }
    return picks.length === need ? picks : null;
  };

  const ladder = [...modifiers.recipes].sort(
    (a, b) => rarityRank[a.from] - rarityRank[b.from],
  );

  let trades = 0;
  let startRarity: Rarity | null = null;
  const byRarity: Partial<Record<Rarity, number>> = {};

  for (const recipe of ladder) {
    const itemCount = Math.max(1, recipe.itemCount);

    for (;;) {
      const main = plan(recipe.from, itemCount);
      if (!main) break;

      const allSpares = main.every((stack) => stack.spare);
      const fuel = quoteTradeFuel({ modifiers, recipe, allSpares, isPlus });
      let fuelPicks: Stack[] = [];
      if (recipe.fuelRarity && fuel.count > 0) {
        // Fuel is planned against the pool the main picks leave behind, which
        // matters when a tier fuels itself or the same stack serves both rows.
        for (const stack of main) stack.left -= 1;
        const planned = plan(recipe.fuelRarity, fuel.count);
        for (const stack of main) stack.left += 1;
        if (!planned) break;
        fuelPicks = planned;
      }

      for (const stack of [...main, ...fuelPicks]) stack.left -= 1;
      trades += 1;
      byRarity[recipe.from] = (byRarity[recipe.from] ?? 0) + 1;
      if (!startRarity) startRarity = recipe.from;
    }
  }

  return { trades, startRarity, byRarity };
}
