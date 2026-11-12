import type { QuestReward } from '@/lib/quests/types';

export type BonusRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ShieldReward = { type: 'SHIELD'; amount?: number };

export type RarityItemReward = {
  type: 'RARITY_ITEM';
  rarity: BonusRarity;
  amount?: number;
};

export type BonusReward = QuestReward | ShieldReward | RarityItemReward;
export type BonusRewards = BonusReward[];

export const LEAP_MARK_IDS = ['hold', 'leap'] as const;
export type LeapMarkId = (typeof LEAP_MARK_IDS)[number];

export type LeapMarkConfig = {
  percent: number;
  minDays: number;
  minScheduled: number;
};

export type LeapLeague = {
  label: string;
  leapPercent: number;
  weekRewards: BonusRewards;
  plusWeekRewards: BonusRewards;
};

export type LeapConfigView = {
  isActive: boolean;
  firstHopRewards: BonusRewards;
  marks: Record<LeapMarkId, LeapMarkConfig>;
  leagues: LeapLeague[];
};

export type LeapDayState = 'none' | 'done' | 'open' | 'missed' | 'skipped';

export type LeapHabitView = {
  key: string;
  taskId: string;
  text: string;
  scheduled: number;
  done: number;
  days: Array<{ date: string; state: LeapDayState }>;
};

export type LeapMarkView = {
  id: LeapMarkId;
  target: number;
  minDays: number;
  available: boolean;
  reached: boolean;
};

export type LeapLeagueView = {
  index: number;
  label: string;
  weekRewards: BonusRewards;
  plusWeekRewards: BonusRewards;
  reached: boolean;
};

export type LeapChestView = {
  league: number;
  rewards: BonusRewards;
  plusRewards: BonusRewards;
  landed: boolean;
  claimed: boolean;
  plusClaimed: boolean;
};

export type LeapWeekView = {
  weekKey: string;
  todayKey: string;
  daysLeft: number;
  scheduled: number;
  hops: number;
  activeDays: number;
  scheduledDays: number;
  open: number;
  openToday: number;
  hold: LeapMarkView;
  leap: LeapMarkView;
  chest: LeapChestView;
  habits: number;
};

export type LeapWeekOutcome =
  | 'up'
  | 'top'
  | 'stay'
  | 'covered'
  | 'down'
  | 'quiet';

export type LeapWeekResult = {
  weekKey: string;
  outcome: LeapWeekOutcome;
  hops: number;
  scheduled: number;
  leagueBefore: number;
  leagueAfter: number;
  newBest: boolean;
  fliesGranted: number;
  grantedItemIds: string[];
  shieldsLeft: number;
  weeksSettled: number;
  firstWeek?: boolean;
  moveUpAt?: number;
  stayAt?: number;
  newItemIds?: string[];
  newBackgroundIds?: string[];
  newFlies?: number;
};

export type LeapJoin = { weekKey: string; giftIds: string[] };

export type LeapPrizePreview = { kind: 'item' | 'background'; id: string };

export type LeapView = {
  enabled: boolean;
  isPremium: boolean;
  league: number;
  bestLeague: number;
  leagues: LeapLeagueView[];
  week: LeapWeekView;
  repeating: number;
  join: LeapJoin | null;
  shields: { count: number; cap: number };
  weekResult: LeapWeekResult | null;
  rewardCatalog: Record<string, unknown>;
  /** Real items a guaranteed-rarity prize can draw, by rarity, for previews. */
  rarityPreview: Record<string, LeapPrizePreview[]>;
};

export type LeapGrantSummary = {
  fliesGranted: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
};

export type LeapHopResult = {
  hops: number;
  landed: boolean;
  marks: LeapMarkId[];
  firstGift: LeapGrantSummary | null;
  grantedItemIds: string[];
  meter: {
    hops: number;
    target: number;
    holdTarget: number;
    reached: LeapMarkId[];
  };
  league: number;
  leagueLabel: string;
  nextLeagueLabel: string | null;
  weekKey: string;
  joined: boolean;
  isPremium: boolean;
  catalog: Record<string, unknown>;
};

export type LeapClaimResult = LeapGrantSummary & {
  free: boolean;
  plus: boolean;
  balanceAfter?: number;
  catalog?: Record<string, unknown>;
};
