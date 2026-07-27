const STALE_AFTER_DAYS = 3;
const STALE_CAP_DAYS = 7;
const URGENT_WITHIN_HOURS = 48;
const ALMOST_THERE_FRACTION = 0.6;

/**
 * Scoring treats the whole 48h window as increasingly urgent, but the badge
 * only earns its place once the reset is genuinely tonight — otherwise every
 * quest on the board wears a countdown and the signal stops meaning anything.
 */
const EXPIRING_LABEL_WITHIN_HOURS = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Floor on the denominator so a one-tap objective cannot divide by ~0 and
 * dominate the board forever. 0.05d ≈ 1.2h of work.
 */
const MIN_EFFORT_DAYS = 0.05;

/**
 * Softens the ratio so a trivial quest does not always outrank a slightly
 * larger one purely on size. 1 = pure WSJF, 0 = effort ignored.
 */
const EFFORT_EXPONENT = 0.85;

/**
 * Cost-of-delay weights. Score is `value / cost`, so these sit in the
 * numerator and effort is structurally non-compensatory: no combination of
 * these can out-vote the work required.
 */
export const VALUE_WEIGHTS = {
  timeCriticality: 0.6,
  neglect: 0.5,
  gradient: 0.4,
  reward: 0.5,
} as const;

export const VALUE_BASE = 1;

export type PriorityReason =
  | 'expiring'
  | 'neglected'
  | 'almost-there'
  | 'streak-at-risk'
  | null;

export type PriorityInput = {
  placement: 'daily' | 'category' | 'onboarding';
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  lastProgressAt?: string;
  expiresAt?: string;
  /** Days of work to make progress *today*. This is the WSJF denominator. */
  effortToActNow?: number;
  /** Days of work to finish the objective outright. Display and tie-breaks. */
  effortToComplete?: number;
  effortAtRiskDays?: number;
  /** Raw reward worth; normalised against the pool before scoring. */
  rewardValue?: number;
};

export type PriorityOptions = {
  maxRewardValue?: number | null;
};

export type PriorityResult = {
  score: number;
  value: number;
  cost: number;
  reason: PriorityReason;
  staleDays: number;
  hoursUntilReset: number | null;
  proximity: number;
  staleness: number;
  urgency: number;
  reward: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Flies are the common currency; a cosmetic is worth a few flies' worth of
// pull, which is enough to break ties between otherwise equal objectives.
const NON_FLY_REWARD_VALUE = 5;

export function rewardWorth(
  rewards?: {
    type?: string;
    amount?: number;
    minAmount?: number;
    maxAmount?: number;
  }[],
): number {
  if (!rewards?.length) return 0;
  return rewards.reduce((sum, reward) => {
    const amount = Math.max(
      0,
      reward.amount ?? reward.minAmount ?? reward.maxAmount ?? 0,
    );
    return sum + (reward.type === 'FLIES' ? amount : NON_FLY_REWARD_VALUE);
  }, 0);
}

export function scoreQuestPriority(
  input: PriorityInput,
  now: number = Date.now(),
  options?: PriorityOptions,
): PriorityResult {
  const target = Math.max(1, input.target);
  const proximity = clamp01(Math.max(0, input.progress) / target);

  let staleDays = 0;
  if (input.lastProgressAt) {
    const at = Date.parse(input.lastProgressAt);
    if (Number.isFinite(at) && at < now) {
      staleDays = Math.floor((now - at) / DAY_MS);
    }
  }
  const staleness = clamp01(staleDays / STALE_CAP_DAYS);

  let hoursUntilReset: number | null = null;
  let urgency = 0;
  if (input.expiresAt) {
    const at = Date.parse(input.expiresAt);
    if (Number.isFinite(at)) {
      hoursUntilReset = Math.max(0, (at - now) / HOUR_MS);
      const linear = clamp01(1 - hoursUntilReset / URGENT_WITHIN_HOURS);
      urgency = linear * linear;
    }
  }

  const atRiskDays = Math.max(0, input.effortAtRiskDays ?? 0);
  const streakRisk = atRiskDays > 0 ? atRiskDays / (atRiskDays + 1) : 0;
  const timeCriticality = Math.max(urgency, streakRisk);

  const maxReward = options?.maxRewardValue ?? null;
  const reward =
    maxReward && maxReward > 0
      ? clamp01(Math.max(0, input.rewardValue ?? 0) / maxReward)
      : 0;

  const value =
    VALUE_BASE +
    VALUE_WEIGHTS.timeCriticality * timeCriticality +
    VALUE_WEIGHTS.neglect * staleness +
    VALUE_WEIGHTS.gradient * proximity +
    VALUE_WEIGHTS.reward * reward;

  const effortNow =
    typeof input.effortToActNow === 'number' && input.effortToActNow >= 0
      ? input.effortToActNow
      : (1 - proximity) * MIN_EFFORT_DAYS * 2;
  const cost = Math.pow(Math.max(MIN_EFFORT_DAYS, effortNow), EFFORT_EXPONENT);

  const score = value / cost;

  let reason: PriorityReason = null;
  if (streakRisk > 0 && proximity < 1) {
    reason = 'streak-at-risk';
  } else if (
    hoursUntilReset !== null &&
    hoursUntilReset <= EXPIRING_LABEL_WITHIN_HOURS &&
    proximity < 1
  ) {
    reason = 'expiring';
  } else if (staleDays >= STALE_AFTER_DAYS) {
    reason = 'neglected';
  } else if (proximity >= ALMOST_THERE_FRACTION && input.progress > 0) {
    reason = 'almost-there';
  }

  return {
    score,
    value,
    cost,
    reason,
    staleDays,
    hoursUntilReset,
    proximity,
    staleness,
    urgency: timeCriticality,
    reward,
  };
}

export function compareQuestPriority(
  a: { input: PriorityInput; result: PriorityResult },
  b: { input: PriorityInput; result: PriorityResult },
): number {
  const onboardingDiff =
    Number(b.input.placement === 'onboarding') -
    Number(a.input.placement === 'onboarding');
  if (onboardingDiff !== 0) return onboardingDiff;

  // Onboarding is a guided sequence, not a menu of interchangeable goals.
  // Always surface the earliest unfinished tier before scoring later tiers.
  if (
    a.input.placement === 'onboarding' &&
    b.input.placement === 'onboarding'
  ) {
    const tierDiff = (a.input.tierIndex ?? 0) - (b.input.tierIndex ?? 0);
    if (tierDiff !== 0) return tierDiff;
  }

  const completionDiff =
    a.input.effortToComplete !== undefined &&
    b.input.effortToComplete !== undefined
      ? a.input.effortToComplete - b.input.effortToComplete
      : 0;
  return (
    Number(a.input.needsFocusTags ?? false) -
      Number(b.input.needsFocusTags ?? false) ||
    b.result.score - a.result.score ||
    (a.input.tierIndex ?? 0) - (b.input.tierIndex ?? 0) ||
    completionDiff ||
    Math.max(1, a.input.target) -
      a.input.progress -
      (Math.max(1, b.input.target) - b.input.progress) ||
    (a.result.hoursUntilReset ?? Number.MAX_VALUE) -
      (b.result.hoursUntilReset ?? Number.MAX_VALUE)
  );
}

export function rankByQuestPriority<T extends PriorityInput>(
  items: T[],
  now: number = Date.now(),
): { item: T; result: PriorityResult }[] {
  const rewards = items
    .map((item) => item.rewardValue ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxRewardValue = rewards.length ? Math.max(...rewards) : null;
  return items
    .map((item) => ({
      item,
      result: scoreQuestPriority(item, now, { maxRewardValue }),
    }))
    .sort((a, b) =>
      compareQuestPriority(
        { input: a.item, result: a.result },
        { input: b.item, result: b.result },
      ),
    );
}

export function resetCountdownLabel(
  hoursUntilReset: number | null,
): string | null {
  if (hoursUntilReset === null) return null;
  if (hoursUntilReset < 1) return 'Resets soon';
  if (hoursUntilReset < 24) {
    return `Resets in ${Math.max(1, Math.round(hoursUntilReset))}h`;
  }
  return `Resets in ${Math.round(hoursUntilReset / 24)}d`;
}

export function priorityReasonLabel(result: PriorityResult): string | null {
  if (result.reason === 'streak-at-risk') {
    return 'Streak at risk!';
  }
  if (result.reason === 'expiring') {
    return resetCountdownLabel(result.hoursUntilReset);
  }
  if (result.reason === 'neglected') {
    return `Quiet for ${result.staleDays} days`;
  }
  if (result.reason === 'almost-there') {
    return 'Almost there!';
  }
  return null;
}
