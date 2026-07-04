import type { QuestReward } from '@/lib/quests/types';

export type StreakFreezeReward = {
  type: 'STREAK_FREEZE';
  amount: number;
};

export type LoginStreakReward = QuestReward | StreakFreezeReward;

export type LoginStreakGoal = {
  days: number;
  startCount: number;
  startDayKey: string;
};

export type LoginStreakNotifState = {
  lastSaverSentDayKey: string;
  saverIgnoredCount: number;
  freezePushSentForDayKey: string;
};

export type LoginStreakState = {
  count: number;
  lastDayKey: string;
  longestStreak: number;
  freezes: number;
  freezeUsedDayKeys: string[];
  goal: LoginStreakGoal | null;
  goalsCompleted: { days: number; dayKey: string }[];
  milestonesReached: number[];
  notif: LoginStreakNotifState;
};

export type LoginStreakGoalTierView = {
  days: number;
  rewards: LoginStreakReward[];
};

export type LoginStreakView = {
  count: number;
  longestStreak: number;
  lastDayKey: string;
  checkedInToday: boolean;
  alive: boolean;
  freezes: number;
  freezeCap: number;
  freezePriceFlies: number;
  freezeUsedDayKeys: string[];
  goal: (LoginStreakGoal & { progress: number }) | null;
  goalTiers: LoginStreakGoalTierView[];
  milestones: { days: number; reached: boolean }[];
};

export type LoginStreakRewardSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  freezesGranted: number;
};

export type LoginStreakRewardEvent = {
  days: number;
  rewardSummary: LoginStreakRewardSummary;
};

export type CheckInResult = {
  active: boolean;
  extended: boolean;
  previousCount: number;
  view: LoginStreakView | null;
  freezeConsumedDays: string[];
  milestoneEvents: LoginStreakRewardEvent[];
  goalEvent: LoginStreakRewardEvent | null;
};
