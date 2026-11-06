import type { QuestReward, QuestRewards } from '@/lib/quests/types';
import {
  RARITY_ORDER,
  type Rarity,
  type WardrobeSlot,
} from '@/lib/skins/catalog';

export type QuestSeasonTierReward = {
  tier: number;
  freeRewards: QuestRewards;
  premiumRewards: QuestRewards;
};

export type SeasonSkinSlot =
  | 'plus1a'
  | 'plus1b'
  | 'plus2'
  | 'plus3'
  | 'plus4'
  | 'plus5'
  | 'plus6';

export type SeasonSkinIds = Partial<Record<SeasonSkinSlot, string>>;
export type SeasonSlotRarities = Record<SeasonSkinSlot, Rarity>;

export const SEASON_SKIN_SLOTS: Array<{
  key: SeasonSkinSlot;
  tier: number;
  finale: boolean;
  lane: 'free' | 'plus';
  rarity: Rarity;
}> = [
  { key: 'plus1a', tier: 1, finale: false, lane: 'plus', rarity: 'epic' },
  { key: 'plus1b', tier: 1, finale: false, lane: 'plus', rarity: 'epic' },
  { key: 'plus2', tier: 2, finale: false, lane: 'plus', rarity: 'rare' },
  { key: 'plus3', tier: 3, finale: false, lane: 'plus', rarity: 'rare' },
  { key: 'plus4', tier: 4, finale: false, lane: 'plus', rarity: 'rare' },
  { key: 'plus5', tier: 5, finale: false, lane: 'plus', rarity: 'rare' },
  { key: 'plus6', tier: 6, finale: false, lane: 'plus', rarity: 'rare' },
];

export const SEASON_SKIN_POOL_SLOTS: WardrobeSlot[] = [
  'skin',
  'hat',
  'body',
  'hand_item',
];

export function defaultSeasonSlotRarities(): SeasonSlotRarities {
  return Object.fromEntries(
    SEASON_SKIN_SLOTS.map((slot) => [slot.key, slot.rarity]),
  ) as SeasonSlotRarities;
}

export function normalizeSeasonSlotRarities(input: unknown): SeasonSlotRarities {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = defaultSeasonSlotRarities();
  for (const slot of SEASON_SKIN_SLOTS) {
    const value = src[slot.key];
    if (RARITY_ORDER.includes(value as Rarity)) out[slot.key] = value as Rarity;
  }
  return out;
}

export function normalizeSeasonSkinPool(input: unknown): WardrobeSlot[] {
  if (!Array.isArray(input)) return [...SEASON_SKIN_POOL_SLOTS];
  const picked = SEASON_SKIN_POOL_SLOTS.filter((slot) => input.includes(slot));
  return picked.length > 0 ? picked : [...SEASON_SKIN_POOL_SLOTS];
}

/**
 * What the grace window after a season ends is actually for.
 *
 * `climb` — the same tasks credit the ended season *and* the new one for the
 * whole window, so someone sitting at tier 27 can genuinely finish. It never
 * delays the new season: they climb both ladders at once.
 * `claim` — the ladder is frozen where it stopped; the window only exists so
 * tiers already reached can still be collected.
 */
export type SeasonGraceMode = 'climb' | 'claim';

/** The pass knobs, every one admin-tunable, clamped to sane bounds. */
export type SeasonPassNumbers = {
  tierCount: number;
  tasksPerStep: number;
  stepsPerTier: number;
  maxStepsPerDay: number;
  tierSkipCost: number;
  graceHours: number;
};

export type SeasonPassConfig = SeasonPassNumbers & {
  graceMode: SeasonGraceMode;
};

export const SEASON_PASS_DEFAULTS: SeasonPassConfig = {
  tierCount: 30,
  tasksPerStep: 3,
  stepsPerTier: 1,
  maxStepsPerDay: 1,
  tierSkipCost: 0,
  graceHours: 72,
  graceMode: 'climb',
};

export const SEASON_PASS_LIMITS: Record<
  keyof SeasonPassNumbers,
  { min: number; max: number }
> = {
  tierCount: { min: 1, max: 100 },
  tasksPerStep: { min: 1, max: 50 },
  stepsPerTier: { min: 1, max: 20 },
  maxStepsPerDay: { min: 1, max: 1 },
  tierSkipCost: { min: 0, max: 0 },
  graceHours: { min: 0, max: 720 },
};

function clampKnob(value: unknown, key: keyof SeasonPassNumbers): number {
  const { min, max } = SEASON_PASS_LIMITS[key];
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return SEASON_PASS_DEFAULTS[key];
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeSeasonPassConfig(input: unknown): SeasonPassConfig {
  const src = (input ?? {}) as Partial<Record<keyof SeasonPassConfig, unknown>>;
  return {
    graceMode: src.graceMode === 'claim' ? 'claim' : 'climb',
    tierCount: clampKnob(src.tierCount, 'tierCount'),
    tasksPerStep: clampKnob(src.tasksPerStep, 'tasksPerStep'),
    stepsPerTier: clampKnob(src.stepsPerTier, 'stepsPerTier'),
    maxStepsPerDay: clampKnob(src.maxStepsPerDay, 'maxStepsPerDay'),
    tierSkipCost: clampKnob(src.tierSkipCost, 'tierSkipCost'),
    graceHours: clampKnob(src.graceHours, 'graceHours'),
  };
}

export function normalizeSeasonSkinIds(input: unknown): SeasonSkinIds {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: SeasonSkinIds = {};
  for (const slot of SEASON_SKIN_SLOTS) {
    const value = src[slot.key];
    if (typeof value === 'string' && value.trim()) out[slot.key] = value.trim();
  }
  return out;
}

export const SIMPLE_GIFT_ID = 'gift_box_1';
export const FANCY_GIFT_ID = 'gift_box_rare';
export const AMAZING_GIFT_ID = 'gift_box_legendary';

const flies = (amount: number): QuestReward => ({
  type: 'FLIES',
  amountMode: 'fixed',
  amount,
});
const gift = (itemId: string): QuestReward => ({
  type: 'BOX',
  itemId,
  amount: 1,
  amountMode: 'fixed',
});
const skinOr = (
  skinIds: SeasonSkinIds,
  slot: SeasonSkinSlot,
  fallback: QuestReward,
): QuestReward => {
  const itemId = skinIds?.[slot];
  return itemId
    ? { type: 'ITEM', itemId, amount: 1, amountMode: 'fixed' }
    : fallback;
};

const basic = () => [gift(SIMPLE_GIFT_ID)];
const rare = (extraFlies = 0) => [gift(FANCY_GIFT_ID), ...(extraFlies ? [flies(extraFlies)] : [])];
const legendary = (extraFlies = 0) => [gift(AMAZING_GIFT_ID), ...(extraFlies ? [flies(extraFlies)] : [])];

const FREE_LANE: QuestRewards[] = [
  [flies(30)],
  basic(), basic(), basic(), basic(), basic(), basic(), basic(),
  [flies(30)],
  basic(), basic(),
  rare(),
  [flies(30)],
  basic(), basic(),
  legendary(),
  [flies(30)],
  basic(), basic(), basic(),
  legendary(),
  [flies(30)],
  basic(), basic(),
  [flies(30)], [flies(30)],
  rare(),
  legendary(),
  [flies(30)],
  rare(),
];

const PLUS_LATE_LANE: QuestRewards[] = [
  rare(), rare(30), rare(), rare(30), legendary(), rare(), rare(40), rare(),
  legendary(30), rare(), rare(30), rare(), legendary(), rare(40), rare(), rare(30),
  rare(40), legendary(30), rare(50), legendary(40), rare(50), legendary(30), rare(50), legendary(50),
];

function plusLane(tier: number, skinIds: SeasonSkinIds): QuestRewards {
  if (tier === 1) {
    return [
      skinOr(skinIds, 'plus1a', gift(AMAZING_GIFT_ID)),
      skinOr(skinIds, 'plus1b', gift(FANCY_GIFT_ID)),
    ];
  }
  if (tier <= 6) {
    return [skinOr(skinIds, `plus${tier}` as SeasonSkinSlot, gift(FANCY_GIFT_ID))];
  }
  return PLUS_LATE_LANE[(tier - 7) % PLUS_LATE_LANE.length];
}

export function buildSeasonPassLadder(
  tierCount: number,
  skinIds: SeasonSkinIds = {},
): QuestSeasonTierReward[] {
  const count = Math.max(1, Math.floor(tierCount));
  return Array.from({ length: count }, (_, index) => {
    const tier = index + 1;
    const free = FREE_LANE[index % FREE_LANE.length];
    const plus = tier <= 30 ? plusLane(tier, skinIds) : rare(30);
    return {
      tier,
      freeRewards: free.map((reward) => ({ ...reward })),
      premiumRewards: plus.map((reward) => ({ ...reward })),
    };
  });
}
