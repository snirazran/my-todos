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

export type TaskStreakAtRisk = {
  taskId: string;
  text: string;
  count: number;
};

/**
 * A single missed day, and everything it is about to break. Day-scoped by
 * design: one freeze (or one ad run) shields the day and therefore every streak
 * listed here at once.
 */
export type StreakRescue = {
  id: string;
  /** Login streak count at risk, or 0 when only habit streaks broke. */
  previousCount: number;
  taskStreaks: TaskStreakAtRisk[];
  missedDayKey: string;
  offeredDayKey: string;
  adsRequired: number;
  adsWatched: number;
  adEligible: boolean;
  freezesAvailable: number;
};

export type RescueMethod = 'ad' | 'freeze';

export type LoginStreakRescue = StreakRescue;

export type LoginStreakState = {
  count: number;
  lastDayKey: string;
  longestStreak: number;
  freezes: number;
  freezeUsedDayKeys: string[];
  protectedDayKeys: string[];
  goal: LoginStreakGoal | null;
  goalsCompleted: { days: number; dayKey: string }[];
  rescue: StreakRescue | null;
  lastRescueDayKey: string;
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
  protectedDayKeys: string[];
  goal: (LoginStreakGoal & { progress: number }) | null;
  goalTiers: LoginStreakGoalTierView[];
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
  goalEvent: LoginStreakRewardEvent | null;
  rescue: LoginStreakRescue | null;
};

export type RescueResult = {
  granted: boolean;
  completed: boolean;
  rescue: StreakRescue | null;
  view: LoginStreakView | null;
  goalEvent: LoginStreakRewardEvent | null;
  error?: 'no-freeze' | 'expired';
};
