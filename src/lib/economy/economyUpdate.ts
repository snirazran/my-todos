import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';
import BackgroundModel from '@/lib/models/Background';
import GiftRulesConfigModel, {
  GIFT_RULES_CONFIG_ID,
  ensureGiftRulesConfig,
} from '@/lib/models/GiftRulesConfig';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';
import QuestStreakConfigModel, { STREAK_CONFIG_ID } from '@/lib/models/QuestStreakConfig';
import EconomyUpdateSnapshotModel, {
  type EconomyUpdateBefore,
  type EconomyUpdateChange,
  type EconomyUpdateSnapshotDoc,
} from '@/lib/models/EconomyUpdateSnapshot';
import { clampGiftRules, type GiftRules } from '@/lib/skins/giftRules';
import { loadSweepConfig } from '@/lib/quests/streak';
import { invalidateCatalogCache } from '@/lib/skins/getCatalog';
import { RARITY_ORDER, isTradeOnlyRarity, type Rarity } from '@/lib/skins/catalog';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import type { QuestReward } from '@/lib/quests/types';

export type PityValues = Pick<
  GiftRules,
  'softPityLuck' | 'softPityBonusPoints' | 'hardPityLuck' | 'epicPityLuck'
>;
export type RarityPrices = Partial<Record<Rarity, number>>;

export type EconomyUpdateInput = {
  pity: PityValues | null;
  dailySlotFlies: number[] | null;
  cleanSweepFlies: number | null;
  itemPrices: RarityPrices;
  backgroundPrices: RarityPrices;
};

export type RarityPriceStats = {
  rarity: Rarity;
  count: number;
  min: number | null;
  max: number | null;
  typical: number | null;
  tradeOnly: boolean;
};

export const RECOMMENDED_ECONOMY_UPDATE: {
  pity: PityValues;
  dailySlotFlies: number[];
  cleanSweepFlies: number;
  itemPrices: RarityPrices;
  backgroundPrices: RarityPrices;
} = {
  pity: { softPityLuck: 70, softPityBonusPoints: 5, hardPityLuck: 100, epicPityLuck: 30 },
  dailySlotFlies: [10, 20, 30],
  cleanSweepFlies: 20,
  itemPrices: { common: 150, uncommon: 350, rare: 700, epic: 1600 },
  backgroundPrices: {},
};

const PITY_KEYS = ['softPityLuck', 'softPityBonusPoints', 'hardPityLuck', 'epicPityLuck'] as const;
const MAX_PRICE = 1_000_000;
const MAX_REWARD_FLIES = 1_000;
const RARITY_NAME: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

type PricedRow = { id: string; rarity: string; priceFlies: number };

type Plan = {
  changes: EconomyUpdateChange[];
  pity: PityValues | null;
  cleanSweepFlies: number | null;
  recipes: Array<{ recipeId: string; before: RecipeSlot[]; after: RecipeSlot[] }>;
  itemPrices: Array<{ price: number; rows: PricedRow[] }>;
  backgroundPrices: Array<{ price: number; rows: PricedRow[] }>;
};

const whole = (value: unknown, max: number): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const rangeText = (values: number[]) => {
  if (values.length === 0) return 'none';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
};

const pityText = (p: PityValues) =>
  `soft ${p.softPityLuck} · step ${p.softPityBonusPoints} · hard ${p.hardPityLuck} · epic ${p.epicPityLuck}`;

const pickPity = (rules: GiftRules): PityValues => ({
  softPityLuck: rules.softPityLuck,
  softPityBonusPoints: rules.softPityBonusPoints,
  hardPityLuck: rules.hardPityLuck,
  epicPityLuck: rules.epicPityLuck,
});

function readPrices(input: unknown, label: string): RarityPrices {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: RarityPrices = {};
  for (const rarity of RARITY_ORDER) {
    if (isTradeOnlyRarity(rarity)) continue;
    const raw = src[rarity];
    if (raw === undefined || raw === null || raw === '') continue;
    const price = whole(raw, MAX_PRICE);
    if (price === null || price <= 0) {
      throw new Error(`${RARITY_NAME[rarity]} ${label} price must be between 1 and ${fmt(MAX_PRICE)}`);
    }
    out[rarity] = price;
  }
  return out;
}

export function readEconomyUpdateInput(body: unknown): EconomyUpdateInput {
  const src = (body ?? {}) as Record<string, unknown>;

  let pity: PityValues | null = null;
  if (src.pity) {
    const raw = src.pity as Record<string, unknown>;
    const values = {} as Record<(typeof PITY_KEYS)[number], number>;
    for (const key of PITY_KEYS) {
      const n = whole(raw[key], 10_000);
      if (n === null) throw new Error('Every pity field needs a whole number from 0 to 10,000');
      values[key] = n;
    }
    if (values.hardPityLuck < 1 || values.epicPityLuck < 1) {
      throw new Error('Hard pity and epic pity must be at least 1');
    }
    if (values.hardPityLuck < values.softPityLuck) {
      throw new Error('Hard pity must be at or above soft pity');
    }
    pity = values;
  }

  let dailySlotFlies: number[] | null = null;
  if (Array.isArray(src.dailySlotFlies) && src.dailySlotFlies.length > 0) {
    dailySlotFlies = src.dailySlotFlies.map((value) => {
      const n = whole(value, MAX_REWARD_FLIES);
      if (n === null) throw new Error(`Daily quest rewards must be 0–${fmt(MAX_REWARD_FLIES)} flies`);
      return n;
    });
  }

  let cleanSweepFlies: number | null = null;
  if (src.cleanSweepFlies !== undefined && src.cleanSweepFlies !== null && src.cleanSweepFlies !== '') {
    cleanSweepFlies = whole(src.cleanSweepFlies, MAX_REWARD_FLIES);
    if (cleanSweepFlies === null) {
      throw new Error(`The Clean Sweep reward must be 0–${fmt(MAX_REWARD_FLIES)} flies`);
    }
  }

  return {
    pity,
    dailySlotFlies,
    cleanSweepFlies,
    itemPrices: readPrices(src.itemPrices, 'outfit'),
    backgroundPrices: readPrices(src.backgroundPrices, 'background'),
  };
}

function rewardFlies(reward: QuestReward): number | null {
  if (reward.type !== 'FLIES') return null;
  if (
    reward.amountMode === 'random' &&
    typeof reward.minAmount === 'number' &&
    typeof reward.maxAmount === 'number'
  ) {
    return (reward.minAmount + reward.maxAmount) / 2;
  }
  return typeof reward.amount === 'number' ? reward.amount : null;
}

function slotFlies(slot: RecipeSlot): number | null {
  const values = (slot.rewards ?? [])
    .map(rewardFlies)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function withFlies(reward: QuestReward, target: number): QuestReward {
  if (reward.type !== 'FLIES') return reward;
  if (
    reward.amountMode === 'random' &&
    typeof reward.minAmount === 'number' &&
    typeof reward.maxAmount === 'number'
  ) {
    const mid = (reward.minAmount + reward.maxAmount) / 2;
    if (mid <= 0) return { ...reward, minAmount: target, maxAmount: target };
    const factor = target / mid;
    return {
      ...reward,
      minAmount: Math.max(0, Math.round(reward.minAmount * factor)),
      maxAmount: Math.max(0, Math.round(reward.maxAmount * factor)),
    };
  }
  return { ...reward, amountMode: reward.amountMode ?? 'fixed', amount: target };
}

function slotsWithFlies(slots: RecipeSlot[], flies: number[]): RecipeSlot[] {
  return slots.map((slot, index) =>
    index < flies.length
      ? { ...slot, rewards: (slot.rewards ?? []).map((reward) => withFlies(reward, flies[index])) }
      : slot,
  );
}

function priceStats(rows: PricedRow[]): RarityPriceStats[] {
  return RARITY_ORDER.map((rarity) => {
    const prices = rows.filter((row) => row.rarity === rarity).map((row) => row.priceFlies);
    const counts = new Map<number, number>();
    prices.forEach((price) => counts.set(price, (counts.get(price) ?? 0) + 1));
    const typical = prices.length
      ? Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
      : null;
    return {
      rarity,
      count: prices.length,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      typical,
      tradeOnly: isTradeOnlyRarity(rarity),
    };
  });
}

const primaryRecipe = (recipes: QuestRecipeDoc[]) =>
  recipes.find((recipe) => recipe.isActive) ?? recipes[0] ?? null;

async function loadCurrent() {
  await connectMongo();
  const [rules, sweep, recipes, items, backgrounds] = await Promise.all([
    ensureGiftRulesConfig(),
    loadSweepConfig(),
    QuestRecipeModel.find({ placement: 'daily' }).lean<QuestRecipeDoc[]>(),
    CatalogItemModel.find({ slot: { $ne: 'container' }, priceFlies: { $gt: 0 } })
      .select('id rarity priceFlies')
      .lean<PricedRow[]>(),
    BackgroundModel.find({ id: { $ne: DEFAULT_BACKGROUND_ID }, priceFlies: { $gt: 0 } })
      .select('id rarity priceFlies')
      .lean<PricedRow[]>(),
  ]);
  return { rules, sweep, recipes, items, backgrounds };
}

type Current = Awaited<ReturnType<typeof loadCurrent>>;

function planPrices(
  rows: PricedRow[],
  prices: RarityPrices,
  noun: string,
  keyPrefix: string,
  changes: EconomyUpdateChange[],
) {
  const out: Plan['itemPrices'] = [];
  for (const rarity of RARITY_ORDER) {
    const price = prices[rarity];
    if (price === undefined) continue;
    const ofRarity = rows.filter((row) => row.rarity === rarity);
    const changing = ofRarity.filter((row) => row.priceFlies !== price);
    if (changing.length === 0) continue;
    changes.push({
      key: `${keyPrefix}:${rarity}`,
      label: `${RARITY_NAME[rarity]} ${noun}`,
      from: rangeText(ofRarity.map((row) => row.priceFlies)),
      to: fmt(price),
      count: changing.length,
    });
    out.push({ price, rows: changing });
  }
  return out;
}

function buildPlan(current: Current, input: EconomyUpdateInput): Plan {
  const changes: EconomyUpdateChange[] = [];

  const nowPity = pickPity(current.rules);
  const pity =
    input.pity && PITY_KEYS.some((key) => input.pity![key] !== nowPity[key]) ? input.pity : null;
  if (pity) {
    changes.push({ key: 'pity', label: 'Gift pity', from: pityText(nowPity), to: pityText(pity) });
  }

  const recipes: Plan['recipes'] = [];
  if (input.dailySlotFlies) {
    for (const recipe of current.recipes) {
      const before = recipe.slots ?? [];
      const after = slotsWithFlies(before, input.dailySlotFlies);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        recipes.push({ recipeId: recipe.recipeId, before, after });
      }
    }
    const primary = primaryRecipe(current.recipes);
    if (recipes.length > 0 && primary) {
      const show = (slots: RecipeSlot[]) =>
        slots
          .slice(0, input.dailySlotFlies!.length)
          .map((slot) => {
            const value = slotFlies(slot);
            return value === null ? '—' : fmt(value);
          })
          .join(' · ');
      const changed = recipes.find((entry) => entry.recipeId === primary.recipeId) ?? recipes[0];
      changes.push({
        key: 'daily',
        label: 'Daily quest rewards',
        from: show(changed.before),
        to: show(changed.after),
        count: recipes.length > 1 ? recipes.length : undefined,
      });
    }
  }

  const cleanSweepFlies =
    input.cleanSweepFlies !== null && input.cleanSweepFlies !== current.sweep.cleanSweepFlies
      ? input.cleanSweepFlies
      : null;
  if (cleanSweepFlies !== null) {
    changes.push({
      key: 'sweep',
      label: 'Clean Sweep reward',
      from: fmt(current.sweep.cleanSweepFlies),
      to: fmt(cleanSweepFlies),
    });
  }

  const itemPrices = planPrices(current.items, input.itemPrices, 'outfits', 'items', changes);
  const backgroundPrices = planPrices(
    current.backgrounds,
    input.backgroundPrices,
    'backgrounds',
    'backgrounds',
    changes,
  );

  return { changes, pity, cleanSweepFlies, recipes, itemPrices, backgroundPrices };
}

async function lastOpenSnapshot() {
  return EconomyUpdateSnapshotModel.findOne({ undoneAt: null })
    .sort({ createdAt: -1 })
    .lean<EconomyUpdateSnapshotDoc | null>();
}

export async function readEconomyUpdateState() {
  const current = await loadCurrent();
  const recipe = primaryRecipe(current.recipes);
  const last = await lastOpenSnapshot();
  return {
    current: {
      pity: pickPity(current.rules),
      cleanSweepFlies: current.sweep.cleanSweepFlies,
      dailySlotFlies: recipe ? (recipe.slots ?? []).map(slotFlies) : [],
      itemPrices: priceStats(current.items),
      backgroundPrices: priceStats(current.backgrounds),
    },
    recommended: RECOMMENDED_ECONOMY_UPDATE,
    lastUpdate: last
      ? { id: String(last._id), at: last.createdAt, changes: last.changes ?? [] }
      : null,
  };
}

export async function previewEconomyUpdate(input: EconomyUpdateInput) {
  const current = await loadCurrent();
  return buildPlan(current, input).changes;
}

async function setPrices(
  model: typeof CatalogItemModel | typeof BackgroundModel,
  entries: Array<{ id: string; priceFlies: number }>,
) {
  if (entries.length === 0) return;
  await (model as typeof CatalogItemModel).bulkWrite(
    entries.map(({ id, priceFlies }) => ({
      updateOne: { filter: { id }, update: { $set: { priceFlies } } },
    })),
    { ordered: false },
  );
}

async function setPity(pity: PityValues) {
  const rules = await ensureGiftRulesConfig();
  await GiftRulesConfigModel.updateOne(
    { configId: GIFT_RULES_CONFIG_ID },
    { $set: { configId: GIFT_RULES_CONFIG_ID, ...clampGiftRules({ ...rules, ...pity }) } },
    { upsert: true },
  );
}

async function setCleanSweepFlies(cleanSweepFlies: number) {
  await QuestStreakConfigModel.updateOne(
    { configId: STREAK_CONFIG_ID },
    { $set: { cleanSweepFlies } },
    { upsert: true },
  );
}

async function setRecipeSlots(recipeId: string, slots: RecipeSlot[]) {
  await QuestRecipeModel.updateOne({ recipeId }, { $set: { slots } });
}

export async function applyEconomyUpdate(input: EconomyUpdateInput, by: string) {
  const current = await loadCurrent();
  const plan = buildPlan(current, input);
  if (plan.changes.length === 0) return { applied: false, changes: [] };

  const before: EconomyUpdateBefore = {};
  if (plan.pity) before.pity = pickPity(current.rules);
  if (plan.cleanSweepFlies !== null) before.cleanSweepFlies = current.sweep.cleanSweepFlies;
  if (plan.recipes.length) {
    before.recipes = plan.recipes.map((entry) => ({ recipeId: entry.recipeId, slots: entry.before }));
  }
  if (plan.itemPrices.length) {
    before.itemPrices = plan.itemPrices.flatMap((entry) =>
      entry.rows.map((row) => ({ id: row.id, priceFlies: row.priceFlies })),
    );
  }
  if (plan.backgroundPrices.length) {
    before.backgroundPrices = plan.backgroundPrices.flatMap((entry) =>
      entry.rows.map((row) => ({ id: row.id, priceFlies: row.priceFlies })),
    );
  }

  const snapshot = await EconomyUpdateSnapshotModel.create({ by, changes: plan.changes, before });

  if (plan.pity) await setPity(plan.pity);
  if (plan.cleanSweepFlies !== null) await setCleanSweepFlies(plan.cleanSweepFlies);
  for (const entry of plan.recipes) await setRecipeSlots(entry.recipeId, entry.after);
  await setPrices(
    CatalogItemModel,
    plan.itemPrices.flatMap((entry) => entry.rows.map((row) => ({ id: row.id, priceFlies: entry.price }))),
  );
  await setPrices(
    BackgroundModel,
    plan.backgroundPrices.flatMap((entry) => entry.rows.map((row) => ({ id: row.id, priceFlies: entry.price }))),
  );
  invalidateCatalogCache();

  return { applied: true, changes: plan.changes, snapshotId: String(snapshot._id) };
}

export async function undoLastEconomyUpdate() {
  await connectMongo();
  const last = await lastOpenSnapshot();
  if (!last) throw new Error('There is no update to undo');

  const claimed = await EconomyUpdateSnapshotModel.findOneAndUpdate(
    { _id: last._id, undoneAt: null },
    { $set: { undoneAt: new Date() } },
    { new: true },
  ).lean<EconomyUpdateSnapshotDoc | null>();
  if (!claimed) throw new Error('That update was already undone');

  const before = claimed.before ?? {};
  if (before.pity) await setPity(before.pity);
  if (typeof before.cleanSweepFlies === 'number') await setCleanSweepFlies(before.cleanSweepFlies);
  for (const recipe of before.recipes ?? []) await setRecipeSlots(recipe.recipeId, recipe.slots);
  await setPrices(CatalogItemModel, before.itemPrices ?? []);
  await setPrices(BackgroundModel, before.backgroundPrices ?? []);
  invalidateCatalogCache();

  return { undone: true, changes: claimed.changes ?? [] };
}
