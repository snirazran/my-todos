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
  tierCount: 20,
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
export const SEASON_GIFT_ID = 'season_gift';
export const SEASON_GIFT_NAME = 'Season Gift';
export const SEASON_LADDER_VERSION = 2;

export type SeasonSet = { ids: string[]; heroId: string | null };

export function normalizeSeasonSet(input: unknown): SeasonSet | null {
  const src = (input ?? {}) as { ids?: unknown; heroId?: unknown };
  if (!Array.isArray(src.ids)) return null;
  const ids: string[] = [];
  src.ids.forEach((value) => {
    if (typeof value === 'string' && value && ids.indexOf(value) < 0) ids.push(value);
  });
  if (ids.length === 0) return null;
  const heroId =
    typeof src.heroId === 'string' && ids.indexOf(src.heroId) >= 0
      ? src.heroId
      : ids[ids.length - 1];
  return { ids, heroId };
}

export function seasonSetFromSkinIds(skinIds: SeasonSkinIds | undefined): SeasonSet | null {
  const picked: string[] = [];
  SEASON_SKIN_SLOTS.forEach((slot) => {
    const id = skinIds?.[slot.key];
    if (id && picked.indexOf(id) < 0) picked.push(id);
  });
  if (picked.length === 0) return null;
  const [hero, ...rest] = picked;
  return { ids: [...rest.reverse(), hero], heroId: hero };
}

export function isSeasonGift(reward: QuestReward): boolean {
  return reward.type === 'BOX' && reward.itemId === SEASON_GIFT_ID;
}

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
const piece = (itemId: string): QuestReward => ({
  type: 'ITEM',
  itemId,
  amount: 1,
  amountMode: 'fixed',
});

const FREE_FLIES = [2, 2, 3, 2, 3, 5, 2, 3, 3, 2, 3];
const PLUS_FLIES = 5;
const PLUS_HERO_AT = 0.75;

function spread(candidates: number[], count: number): number[] {
  if (count <= 0) return [];
  if (count >= candidates.length) return [...candidates];
  if (count === 1) return [candidates[0]];
  return Array.from(
    { length: count },
    (_, index) => candidates[Math.round((index * (candidates.length - 1)) / (count - 1))],
  );
}

export function buildSeasonPassLadder(
  tierCount: number,
  skinIds: SeasonSkinIds = {},
  set?: SeasonSet | null,
): QuestSeasonTierReward[] {
  const count = Math.max(1, Math.floor(tierCount));
  const resolved = set ?? seasonSetFromSkinIds(skinIds);
  const heroId = resolved?.heroId ?? null;
  const pieces = (resolved?.ids ?? []).filter((id) => id !== heroId);
  const plusOrder =
    pieces.length > 1 ? [pieces[pieces.length - 1], ...pieces.slice(0, -1)] : pieces;

  const plusHeroTier = Math.max(1, Math.round(count * PLUS_HERO_AT));
  const isPlusGiftTier = (tier: number) => tier % 4 === 2 && tier < plusHeroTier;
  const odd: number[] = [];
  const even: number[] = [];
  for (let tier = 1; tier < plusHeroTier - 1; tier += 1) {
    if (tier % 2 === 1) odd.push(tier);
    else if (!isPlusGiftTier(tier)) even.push(tier);
  }
  const candidates =
    plusOrder.length <= odd.length ? odd : [...odd, ...even].sort((a, b) => a - b);
  const pieceTiers = spread(candidates, plusOrder.length);
  const plusPieces = new Map<number, string[]>();
  plusOrder.forEach((id, index) => {
    const tier = pieceTiers.length > 0 ? pieceTiers[index % pieceTiers.length] : 1;
    plusPieces.set(tier, [...(plusPieces.get(tier) ?? []), id]);
  });

  const chestSlots: number[] = [];
  for (let tier = 2; tier <= count - 3; tier += 5) chestSlots.push(tier);
  const chestCount = Math.min(chestSlots.length, Math.floor(pieces.length / 2));
  const chestTiers = Array.from(
    { length: chestCount },
    (_, index) => chestSlots[Math.round((index * chestSlots.length) / chestCount)],
  );

  let flyCursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const tier = index + 1;
    let freeRewards: QuestRewards;
    if (tier === count && count > 1) {
      freeRewards = [heroId ? piece(heroId) : gift(AMAZING_GIFT_ID)];
    } else if (tier === count - 2) {
      freeRewards = [gift(FANCY_GIFT_ID)];
    } else if (chestTiers.indexOf(tier) >= 0) {
      freeRewards = [gift(SEASON_GIFT_ID)];
    } else if (chestSlots.indexOf(tier) >= 0 || (tier % 5 === 4 && tier < count - 5)) {
      freeRewards = [gift(SIMPLE_GIFT_ID)];
    } else {
      freeRewards = [flies(FREE_FLIES[flyCursor % FREE_FLIES.length])];
      flyCursor += 1;
    }

    const tierPieces = plusPieces.get(tier) ?? [];
    let premiumRewards: QuestRewards;
    if (tier === plusHeroTier && heroId) {
      premiumRewards = [piece(heroId), ...tierPieces.slice(0, 1).map(piece)];
    } else if (tierPieces.length > 0) {
      premiumRewards = tierPieces.slice(0, 2).map(piece);
    } else if (tier >= count - 1) {
      premiumRewards = [gift(AMAZING_GIFT_ID)];
    } else if (tier === plusHeroTier + 2 || isPlusGiftTier(tier)) {
      premiumRewards = [gift(FANCY_GIFT_ID)];
    } else {
      premiumRewards = [flies(PLUS_FLIES)];
    }
    return { tier, freeRewards, premiumRewards };
  });
}
