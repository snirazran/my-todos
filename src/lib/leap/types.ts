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
  flies: number;
};

export type LeapLuckyDrop = { weight: number; rewards: BonusRewards };

export type LeapLeague = {
  label: string;
  multiplier: number;
  /** Paid every week the Leap is landed while in this league. */
  weekRewards: BonusRewards;
  /** Paid once, the first time the league is reached. */
  reachRewards: BonusRewards;
  /** Plus adds this the first time the league is reached. */
  plusReachRewards: BonusRewards;
  /** Plus adds this every week the Leap is landed in this league. */
  plusWeekRewards: BonusRewards;
};

export type LeapConfigView = {
  isActive: boolean;
  hopFlies: number;
  hopsPaidPerDay: number;
  comebackFlies: number;
  comebackLookbackDays: number;
  comebacksPerDay: number;
  luckyChancePercent: number;
  luckyPityHops: number;
  luckyDropsPerDay: number;
  firstHopRewards: BonusRewards;
  luckyDrops: LeapLuckyDrop[];
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
  multiplier: number;
  weekRewards: BonusRewards;
  reachRewards: BonusRewards;
  plusReachRewards: BonusRewards;
  plusWeekRewards: BonusRewards;
  /** Flies the weekly prize pays in this league, before Plus doubling. */
  weekFlies: number;
  reached: boolean;
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
  /** Flies the Leap mark pays, league and Plus applied. */
  leapFlies: number;
  holdFlies: number;
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
};

export type LeapPrizePreview = { kind: 'item' | 'background'; id: string };

export type LeapView = {
  enabled: boolean;
  isPremium: boolean;
  league: number;
  bestLeague: number;
  leagues: LeapLeagueView[];
  week: LeapWeekView;
  shields: { count: number; cap: number };
  hopFlies: number;
  firstDropPending: boolean;
  forgoneFlies: number;
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
  hopFlies: number;
  comebackFlies: number;
  lucky: (LeapGrantSummary & { first: boolean }) | null;
  marks: Array<LeapGrantSummary & { id: LeapMarkId }>;
  fliesGranted: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
  meter: {
    hops: number;
    target: number;
    holdTarget: number;
    reached: LeapMarkId[];
  };
  league: number;
  leagueLabel: string;
  nextLeagueLabel: string | null;
  isPremium: boolean;
  catalog: Record<string, unknown>;
  balanceAfter?: number;
};
