import { byId as staticById, rarityRank, type Rarity } from './catalog';

export type TradeRecipe = {
  from: Rarity;
  to: Rarity;
  itemCount: number;
};

export type TradeModifiers = {
  recipes: TradeRecipe[];
  goldenTradeChancePercent: number;
  goldenTradeRewardCount: number;
  wishlistRedirectPercent: number;
  wishlistSlotsFree: number;
  wishlistSlotsPlus: number;
};

export const TRADE_LADDER_VERSION = 2;

export const DEFAULT_TRADE_RECIPES: TradeRecipe[] = [
  { from: 'common', to: 'uncommon', itemCount: 3 },
  { from: 'uncommon', to: 'rare', itemCount: 3 },
  { from: 'rare', to: 'epic', itemCount: 3 },
  { from: 'epic', to: 'legendary', itemCount: 4 },
];

export const DEFAULT_TRADE_MODIFIERS: TradeModifiers = {
  recipes: DEFAULT_TRADE_RECIPES,
  goldenTradeChancePercent: 5,
  goldenTradeRewardCount: 2,
  wishlistRedirectPercent: 100,
  wishlistSlotsFree: 4,
  wishlistSlotsPlus: 10,
};

export function recipeFor(
  modifiers: TradeModifiers,
  rarity: Rarity,
): TradeRecipe | null {
  return modifiers.recipes.find((recipe) => recipe.from === rarity) ?? null;
}

export function wishlistSlots(modifiers: TradeModifiers, isPlus: boolean) {
  return isPlus ? modifiers.wishlistSlotsPlus : modifiers.wishlistSlotsFree;
}

export const sparesOf = (owned: number) => Math.max(0, owned - 1);

export type TradeCandidate = { rarity: Rarity; owned: number };

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
  trades: number;
  startRarity: Rarity | null;
  byRarity: Partial<Record<Rarity, number>>;
  sparesByRarity: Partial<Record<Rarity, number>>;
};

export function countReadyTrades({
  candidates,
  modifiers,
}: {
  candidates: readonly TradeCandidate[];
  modifiers: TradeModifiers;
}): TradeReadiness {
  const sparesByRarity: Partial<Record<Rarity, number>> = {};
  for (const candidate of candidates) {
    const spares = sparesOf(candidate.owned);
    if (spares <= 0) continue;
    sparesByRarity[candidate.rarity] = (sparesByRarity[candidate.rarity] ?? 0) + spares;
  }

  const ladder = [...modifiers.recipes].sort(
    (a, b) => rarityRank[a.from] - rarityRank[b.from],
  );

  let trades = 0;
  let startRarity: Rarity | null = null;
  const byRarity: Partial<Record<Rarity, number>> = {};
  for (const recipe of ladder) {
    const ready = Math.floor(
      (sparesByRarity[recipe.from] ?? 0) / Math.max(1, recipe.itemCount),
    );
    if (ready <= 0) continue;
    byRarity[recipe.from] = ready;
    trades += ready;
    if (!startRarity) startRarity = recipe.from;
  }

  return { trades, startRarity, byRarity, sparesByRarity };
}
