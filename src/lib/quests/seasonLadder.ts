import type { QuestReward, QuestRewards } from '@/lib/quests/types';

export type QuestSeasonTierReward = {
  tier: number;
  freeRewards: QuestRewards;
  premiumRewards: QuestRewards;
};

export type SeasonSkinSlot =
  | 'uncommon'
  | 'rare1'
  | 'rare2'
  | 'epic1'
  | 'epic2'
  | 'legendary';

export type SeasonSkinIds = Partial<Record<SeasonSkinSlot, string>>;

export const SEASON_SKIN_SLOTS: Array<{
  key: SeasonSkinSlot;
  label: string;
  rarity: string;
  tier: number;
  lane: 'free' | 'plus';
}> = [
  { key: 'uncommon', label: 'Uncommon skin', rarity: 'uncommon', tier: 6, lane: 'plus' },
  { key: 'rare1', label: 'Rare skin (free trophy)', rarity: 'rare', tier: 12, lane: 'free' },
  { key: 'rare2', label: 'Rare skin', rarity: 'rare', tier: 16, lane: 'plus' },
  { key: 'epic1', label: 'Epic skin', rarity: 'epic', tier: 24, lane: 'plus' },
  { key: 'epic2', label: 'Epic skin (free finale)', rarity: 'epic', tier: 30, lane: 'free' },
  { key: 'legendary', label: 'Legendary skin (Plus finale)', rarity: 'legendary', tier: 30, lane: 'plus' },
];

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
  maxStepsPerDay: 2,
  tierSkipCost: 200,
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
  maxStepsPerDay: { min: 1, max: 20 },
  tierSkipCost: { min: 0, max: 100_000 },
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
const shield = (amount = 1): QuestReward => ({
  type: 'SHIELD',
  amount,
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

/**
 * The 30-rung battle-pass shape: heavy free value up front to hook non-payers,
 * a free Rare skin at the midpoint so the free track has a real trophy, then a
 * taper where the Plus column visibly pulls ahead. Every tier pays something on
 * both columns — there are no dead rungs.
 *
 * Plus does not double the free column; the Plus column *is* the benefit.
 * Free totals 565 flies / 6 gifts / 1 Lily Pad / 2 skins; Plus adds 610 flies /
 * 10 gifts / 3 Lily Pads / 4 skins.
 */
export function buildSeasonPassLadder(
  tierCount: number,
  skinIds: SeasonSkinIds = {},
): QuestSeasonTierReward[] {
  const base: Array<[QuestRewards, QuestRewards]> = [
    [[flies(20)], [flies(30)]],
    [[gift(SIMPLE_GIFT_ID)], [flies(30)]],
    [[flies(20)], [gift(SIMPLE_GIFT_ID)]],
    [[flies(20)], [flies(40)]],
    [[gift(FANCY_GIFT_ID)], [gift(FANCY_GIFT_ID)]],
    [[flies(15)], [skinOr(skinIds, 'uncommon', gift(FANCY_GIFT_ID))]],
    [[flies(20)], [flies(30)]],
    [[gift(SIMPLE_GIFT_ID)], [flies(40)]],
    [[flies(15)], [gift(SIMPLE_GIFT_ID)]],
    [[flies(40), gift(FANCY_GIFT_ID)], [shield(), flies(45)]],
    [[flies(15)], [flies(30)]],
    [[skinOr(skinIds, 'rare1', gift(AMAZING_GIFT_ID))], [gift(FANCY_GIFT_ID)]],
    [[flies(15)], [flies(40)]],
    [[gift(SIMPLE_GIFT_ID)], [flies(30)]],
    [[flies(25), shield()], [gift(AMAZING_GIFT_ID)]],
    [[flies(15)], [skinOr(skinIds, 'rare2', gift(AMAZING_GIFT_ID))]],
    [[flies(20)], [flies(40)]],
    [[flies(15)], [gift(FANCY_GIFT_ID)]],
    [[flies(15)], [flies(40)]],
    [[flies(40), gift(FANCY_GIFT_ID)], [shield(), flies(45)]],
    [[flies(15)], [flies(40)]],
    [[flies(20)], [gift(FANCY_GIFT_ID)]],
    [[flies(20)], [flies(40)]],
    [[flies(20)], [skinOr(skinIds, 'epic1', gift(AMAZING_GIFT_ID))]],
    [[flies(30), gift(AMAZING_GIFT_ID)], [gift(AMAZING_GIFT_ID)]],
    [[flies(15)], [flies(45)]],
    [[flies(20)], [gift(FANCY_GIFT_ID)]],
    [[flies(15)], [flies(45)]],
    [[flies(20)], [shield()]],
  ];

  const finale: [QuestRewards, QuestRewards] = [
    [skinOr(skinIds, 'epic2', gift(AMAZING_GIFT_ID)), flies(80)],
    [skinOr(skinIds, 'legendary', gift(AMAZING_GIFT_ID)), gift(AMAZING_GIFT_ID)],
  ];

  const count = Math.max(1, Math.floor(tierCount));
  return Array.from({ length: count }, (_, index) => {
    const tier = index + 1;
    const lanes = tier === count ? finale : base[(tier - 1) % base.length];
    return {
      tier,
      freeRewards: lanes[0].map((reward) => ({ ...reward })),
      premiumRewards: lanes[1].map((reward) => ({ ...reward })),
    };
  });
}
