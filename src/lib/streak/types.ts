import type { QuestReward } from '@/lib/quests/types';
import type { ShieldOffer } from '@/lib/shields/types';

export type ShieldReward = {
  type: 'SHIELD';
  amount: number;
};

export type LoginStreakReward = QuestReward | ShieldReward;

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
 * design: one ad run covers the day and therefore every streak listed here at
 * once.
 *
 * A held shield never reaches this offer — it fires by itself at check-in, so
 * this sheet only appears for a user with nothing in stock.
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
};

export type RescueMethod = 'ad';

export type LoginStreakRescue = StreakRescue;

export type LoginStreakState = {
  count: number;
  lastDayKey: string;
  longestStreak: number;
  /** Days a shield auto-covered, for the snowflake marks on the week strip. */
  shieldedDayKeys: string[];
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
  /** The shared shield pool, mirrored here so the streak sheet needs no second fetch. */
  shields: number;
  shieldCap: number;
  shieldedDayKeys: string[];
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
  shieldsGranted: number;
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
  /** Days a shield covered during this check-in, for the "saved you" notice. */
  shieldConsumedDays: string[];
  goalEvent: LoginStreakRewardEvent | null;
  rescue: LoginStreakRescue | null;
  /** Set when the miss went uncovered and the user holds nothing. */
  shieldOffer: ShieldOffer | null;
};

export type RescueResult = {
  granted: boolean;
  completed: boolean;
  rescue: StreakRescue | null;
  view: LoginStreakView | null;
  goalEvent: LoginStreakRewardEvent | null;
  error?: 'expired';
};
