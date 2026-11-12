import type {
  BonusRewards,
  LeapConfigView,
  LeapLeague,
  LeapMarkConfig,
  LeapMarkId,
} from './types';

export const LEAP_CONFIG_ID = 'leap';
export const LEAP_CONFIG_VERSION = 6;

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

export const DEFAULT_LEAP_MARKS: Record<LeapMarkId, LeapMarkConfig> = {
  hold: { percent: 40, minDays: 2, minScheduled: 2 },
  leap: { percent: 70, minDays: 3, minScheduled: 3 },
};

export const DEFAULT_CHEST_FLIES = [20, 25, 30, 40, 50];

export const DEFAULT_LEAP_FIRST_HOP_REWARDS: BonusRewards = [
  { type: 'BOX', itemId: SIMPLE_GIFT },
];

const flies = (index: number) => ({ type: 'FLIES' as const, amount: DEFAULT_CHEST_FLIES[index] });
const box = (itemId: string) => ({ type: 'BOX' as const, itemId });

export const DEFAULT_LEAP_LEAGUES: LeapLeague[] = [
  {
    label: 'Lily Leaf',
    leapPercent: 50,
    weekRewards: [flies(0), box(SIMPLE_GIFT)],
    plusWeekRewards: [flies(0), box(FANCY_GIFT)],
  },
  {
    label: 'Lily Bud',
    leapPercent: 60,
    weekRewards: [flies(1), box(FANCY_GIFT)],
    plusWeekRewards: [flies(1), box(FANCY_GIFT)],
  },
  {
    label: 'Lily Bloom',
    leapPercent: 70,
    weekRewards: [flies(2), box(FANCY_GIFT), box(SIMPLE_GIFT)],
    plusWeekRewards: [flies(2), box(AMAZING_GIFT)],
  },
  {
    label: 'Lily Bouquet',
    leapPercent: 75,
    weekRewards: [flies(3), box(AMAZING_GIFT)],
    plusWeekRewards: [flies(3), box(AMAZING_GIFT)],
  },
  {
    label: 'Lily Garden',
    leapPercent: 80,
    weekRewards: [flies(4), box(AMAZING_GIFT), box(FANCY_GIFT)],
    plusWeekRewards: [flies(4), box(AMAZING_GIFT), box(FANCY_GIFT)],
  },
];

export const LEAP_DEFAULTS: LeapConfigView = {
  isActive: true,
  firstHopRewards: DEFAULT_LEAP_FIRST_HOP_REWARDS,
  marks: DEFAULT_LEAP_MARKS,
  leagues: DEFAULT_LEAP_LEAGUES,
};
