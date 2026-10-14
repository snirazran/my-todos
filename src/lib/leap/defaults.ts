import type {
  BonusRewards,
  LeapConfigView,
  LeapLuckyDrop,
  LeapLeague,
  LeapMarkConfig,
  LeapMarkId,
} from './types';

export const LEAP_CONFIG_ID = 'leap';
export const LEAP_CONFIG_VERSION = 5;

export const RETIRED_LEAGUE_LABELS = [
  'Bronze Lily',
  'Silver Lily',
  'Gold Lily',
  'Emerald Lily',
  'Diamond Lily',
];

const SIMPLE_GIFT = 'gift_box_1';
const FANCY_GIFT = 'gift_box_rare';
const AMAZING_GIFT = 'gift_box_legendary';

export const LEGACY_WEEK_GIFTS = [SIMPLE_GIFT, SIMPLE_GIFT, FANCY_GIFT, FANCY_GIFT, AMAZING_GIFT];
export const LEGACY_LEAP_MARK_FLIES = 25;

export const DEFAULT_LEAP_MARKS: Record<LeapMarkId, LeapMarkConfig> = {
  hold: { percent: 40, minDays: 2, minScheduled: 2, flies: 10 },
  leap: { percent: 70, minDays: 3, minScheduled: 3, flies: 40 },
};

export const DEFAULT_LEAP_LUCKY_DROPS: LeapLuckyDrop[] = [
  { weight: 50, rewards: [{ type: 'FLIES', amount: 10 }] },
  { weight: 35, rewards: [{ type: 'BOX', itemId: SIMPLE_GIFT }] },
  { weight: 12, rewards: [{ type: 'BOX', itemId: FANCY_GIFT }] },
  { weight: 3, rewards: [{ type: 'SHIELD', amount: 1 }] },
];

export const DEFAULT_LEAP_FIRST_HOP_REWARDS: BonusRewards = [
  { type: 'BOX', itemId: SIMPLE_GIFT },
];

export const DEFAULT_LEAP_LEAGUES: LeapLeague[] = [
  {
    label: 'Lily Leaf',
    multiplier: 1,
    leapPercent: 50,
    weekRewards: [{ type: 'BOX', itemId: SIMPLE_GIFT }],
    plusWeekRewards: [{ type: 'BOX', itemId: SIMPLE_GIFT }],
    reachRewards: [],
    plusReachRewards: [],
  },
  {
    label: 'Lily Bud',
    multiplier: 1.25,
    leapPercent: 60,
    weekRewards: [{ type: 'BOX', itemId: FANCY_GIFT }],
    plusWeekRewards: [{ type: 'BOX', itemId: SIMPLE_GIFT }],
    reachRewards: [
      { type: 'FLIES', amount: 100 },
      { type: 'BOX', itemId: FANCY_GIFT },
    ],
    plusReachRewards: [
      { type: 'FLIES', amount: 50 },
      { type: 'BOX', itemId: FANCY_GIFT },
    ],
  },
  {
    label: 'Lily Bloom',
    multiplier: 1.5,
    leapPercent: 70,
    weekRewards: [{ type: 'BOX', itemId: FANCY_GIFT }],
    plusWeekRewards: [{ type: 'BOX', itemId: FANCY_GIFT }],
    reachRewards: [
      { type: 'FLIES', amount: 150 },
      { type: 'BOX', itemId: AMAZING_GIFT },
    ],
    plusReachRewards: [
      { type: 'FLIES', amount: 75 },
      { type: 'RARITY_ITEM', rarity: 'rare' },
    ],
  },
  {
    label: 'Lily Bouquet',
    multiplier: 1.75,
    leapPercent: 75,
    weekRewards: [{ type: 'BOX', itemId: AMAZING_GIFT }],
    plusWeekRewards: [{ type: 'BOX', itemId: FANCY_GIFT }],
    reachRewards: [
      { type: 'FLIES', amount: 200 },
      { type: 'RARITY_ITEM', rarity: 'epic' },
    ],
    plusReachRewards: [
      { type: 'FLIES', amount: 100 },
      { type: 'BOX', itemId: AMAZING_GIFT },
    ],
  },
  {
    label: 'Lily Garden',
    multiplier: 2,
    leapPercent: 80,
    weekRewards: [{ type: 'BOX', itemId: AMAZING_GIFT }],
    plusWeekRewards: [{ type: 'BOX', itemId: AMAZING_GIFT }],
    reachRewards: [
      { type: 'FLIES', amount: 300 },
      { type: 'RARITY_ITEM', rarity: 'legendary' },
    ],
    plusReachRewards: [
      { type: 'FLIES', amount: 150 },
      { type: 'RARITY_ITEM', rarity: 'epic' },
    ],
  },
];

export const LEAP_DEFAULTS: LeapConfigView = {
  isActive: true,
  hopFlies: 2,
  hopsPaidPerDay: 8,
  comebackFlies: 5,
  comebackLookbackDays: 7,
  comebacksPerDay: 1,
  luckyChancePercent: 10,
  luckyPityHops: 12,
  luckyDropsPerDay: 2,
  firstHopRewards: DEFAULT_LEAP_FIRST_HOP_REWARDS,
  luckyDrops: DEFAULT_LEAP_LUCKY_DROPS,
  marks: DEFAULT_LEAP_MARKS,
  leagues: DEFAULT_LEAP_LEAGUES,
};

export const LEAP_NUMBER_LIMITS: Partial<
  Record<keyof LeapConfigView, { min: number; max: number }>
> = {
  hopFlies: { min: 0, max: 50 },
  hopsPaidPerDay: { min: 0, max: 50 },
  comebackFlies: { min: 0, max: 100 },
  comebackLookbackDays: { min: 1, max: 30 },
  comebacksPerDay: { min: 0, max: 10 },
  luckyChancePercent: { min: 0, max: 100 },
  luckyPityHops: { min: 0, max: 200 },
  luckyDropsPerDay: { min: 0, max: 20 },
};
