import type { QuestReward } from '@/lib/quests/types';
import type { ShieldOffer } from '@/lib/shields/types';

export type ShieldReward = {
  type: 'SHIELD';
  amount: number;
};

export type SkinRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

/**
 * A guaranteed wearable at or above `minRarity`, drawn at grant time. A pledge
 * rung promising "Rare or better" has to keep that promise, which a gift box
 * cannot — a box only shifts the odds.
 */
export type SkinRollReward = {
  type: 'SKIN_ROLL';
  minRarity: SkinRarity;
};

export type LoginStreakReward = QuestReward | ShieldReward | SkinRollReward;

export type LoginStreakGoal = {
  days: number;
  startCount: number;
  startDayKey: string;
};

/** Endowed progress: the pledge itself is step one, already filled. */
export type LoginStreakGoalProgress = LoginStreakGoal & {
  progress: number;
  /** days + 1 — the extra step is the pledge the user already made. */
  stepCount: number;
  stepsFilled: number;
  /** Percent of the tier's flies this completion will pay. */
  payoutPercent: number;
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
  dismissed?: boolean;
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
  /** What this rung would pay if pledged right now, after repeat decay. */
  payoutPercent: number;
  /** Times this rung has been completed since the user last stepped up. */
  repeatIndex: number;
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
  goal: LoginStreakGoalProgress | null;
  goalTiers: LoginStreakGoalTierView[];
  /** The rung to offer next — one above the highest kept so far. */
  nextTierDays: number | null;
};

export type LoginStreakRewardSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
  /** Present for free players only: the ad that buys the same double Plus got. */
  doubleClaimId?: string;
};

export type LoginStreakRewardEvent = {
  days: number;
  rewardSummary: LoginStreakRewardSummary;
  /** Percent of the tier's flies this completion actually paid. */
  payoutPercent: number;
  /** Non-fly prizes were withheld because this was a repeat of the same rung. */
  itemsWithheld: boolean;
  /** The rung to offer straight away, so the ladder never goes quiet. */
  nextTierDays: number | null;
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
