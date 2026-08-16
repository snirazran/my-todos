import type { Rarity } from './catalog';

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
