const ALMOST_THERE_FRACTION = 0.6;

/**
 * Scoring treats the whole window as increasingly urgent, but the badge only
 * earns its place once the reset is genuinely tonight — otherwise every quest on
 * the board wears a countdown and the signal stops meaning anything.
 */
const EXPIRING_LABEL_WITHIN_HOURS = 12;

const NOW_OR_NEVER_FEASIBILITY = 0.85;

const HOUR_MS = 60 * 60 * 1000;

/** A daily resets tonight; a Leap week runs Monday to Sunday. */
export const DAILY_WINDOW_HOURS = 24;
export const WEEK_WINDOW_HOURS = 7 * 24;

/**
 * Effort is carried in notional "days of work" (a task is 0.1). This converts it
 * to wall-clock hours so remaining work can be compared against remaining time.
 */
const REAL_HOURS_PER_EFFORT_DAY = 3;

/**
 * Floor on the denominator so a one-tap objective cannot divide by ~0 and
 * dominate the board forever. 0.05d ≈ one task's worth of work.
 */
const MIN_EFFORT_DAYS = 0.05;

/**
 * Softens the ratio so a trivial quest does not always outrank a slightly
 * larger one purely on size. 1 = pure WSJF, 0 = effort ignored.
 */
const EFFORT_EXPONENT = 0.85;

/** Flies at which reward pull saturates — roughly a daily's middle payout. */
const REWARD_REFERENCE_FLIES = 20;

/**
 * Cost-of-delay weights. Score is `value / cost`, so these sit in the
 * numerator and effort is structurally non-compensatory: no combination of
 * these can out-vote the work required.
 */
export const VALUE_WEIGHTS = {
  urgency: 0.9,
  gradient: 0.5,
  reward: 0.45,
  streak: 0.8,
} as const;

export const VALUE_BASE = 1;

export type PriorityKind = 'quest' | 'leap';

export type PriorityReason =
  | 'streak-at-risk'
  | 'now-or-never'
  | 'expiring'
  | 'last-step'
  | 'almost-there'
  | null;

export type PriorityInput = {
  kind?: PriorityKind;
  placement?: 'daily' | 'category' | 'onboarding';
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  expiresAt?: string;
  /** Hours until this item is gone. Wins over `expiresAt` when both are given. */
  hoursLeftInWindow?: number;
  /** Length of the item's own window, so pressure is a fraction of ITS clock. */
  windowHours?: number;
  /**
   * Scheduled chances beyond the sessions still needed. 0 means every remaining
   * chance has to land, so today is mandatory. Leap only; null for a daily,
   * which has a single window rather than a run of them.
   */
  slackDays?: number | null;
  /** Days of work to make progress *today*. This is the WSJF denominator. */
  effortToActNow?: number;
  /** Days of work to finish the objective outright. Display and tie-breaks. */
  effortToComplete?: number;
  /**
   * How much streak a miss would cost. A quest passes days at risk, a Leap
   * passes weeks; the curve only needs "more is worse".
   */
  streakAtRisk?: number;
  /** Absolute reward worth in flies. */
  rewardValue?: number;
};

export type PriorityResult = {
  score: number;
  value: number;
  cost: number;
  reason: PriorityReason;
  hoursUntilReset: number | null;
  proximity: number;
  /** How much of the item's own window has burned away. */
  deadlinePressure: number;
  /** Whether the work still fits the time or chances left. */
  feasibility: number;
  /** The combined time criticality actually used in the score. */
  urgency: number;
  reward: number;
  streakRisk: number;
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
): PriorityResult {
  const target = Math.max(1, input.target);
  const progress = Math.max(0, input.progress);
  const proximity = clamp01(progress / target);
  const unitsRemaining = Math.max(0, target - progress);

  let hoursUntilReset: number | null = null;
  if (typeof input.hoursLeftInWindow === 'number') {
    hoursUntilReset = Math.max(0, input.hoursLeftInWindow);
  } else if (input.expiresAt) {
    const at = Date.parse(input.expiresAt);
    if (Number.isFinite(at)) hoursUntilReset = Math.max(0, (at - now) / HOUR_MS);
  }

  const windowHours = Math.max(
    1,
    input.windowHours ??
      (input.kind === 'leap' ? WEEK_WINDOW_HOURS : DAILY_WINDOW_HOURS),
  );
  const burned =
    hoursUntilReset === null ? 0 : clamp01(1 - hoursUntilReset / windowHours);
  const deadlinePressure = burned * burned;

  const effortNow =
    typeof input.effortToActNow === 'number' && input.effortToActNow >= 0
      ? input.effortToActNow
      : (1 - proximity) * MIN_EFFORT_DAYS * 2;

  // Two different questions, depending on what limits the item. A Leap is
  // limited by how many scheduled days are left relative to the sessions it
  // still needs; a daily is limited by whether tonight still fits the work.
  let feasibility = 0;
  if (input.kind === 'leap' && typeof input.slackDays === 'number') {
    feasibility = 1 / (1 + Math.max(0, input.slackDays));
  } else if (hoursUntilReset !== null) {
    const hoursNeeded = effortNow * REAL_HOURS_PER_EFFORT_DAY;
    feasibility = clamp01(hoursNeeded / Math.max(0.5, hoursUntilReset));
  }

  const atRisk = Math.max(0, input.streakAtRisk ?? 0);
  const streakRisk = atRisk > 0 ? atRisk / (atRisk + 2) : 0;

  // Two measures of the same thing, so the larger stands rather than both
  // stacking — otherwise an item that is merely late reads as unmissable.
  const urgency = Math.max(deadlinePressure, feasibility);

  const reward = clamp01(
    Math.max(0, input.rewardValue ?? 0) / REWARD_REFERENCE_FLIES,
  );

  // Goal-gradient (Hull; Kivetz, Urminsky & Zheng): pull rises near the goal,
  // and one step from done is the strongest pull there is.
  const completionPull = Math.max(
    proximity,
    unitsRemaining === 1 && target > 1 ? 0.85 : 0,
  );

  const value =
    VALUE_BASE +
    VALUE_WEIGHTS.urgency * urgency +
    VALUE_WEIGHTS.gradient * completionPull +
    VALUE_WEIGHTS.reward * reward +
    VALUE_WEIGHTS.streak * streakRisk;

  const cost = Math.pow(Math.max(MIN_EFFORT_DAYS, effortNow), EFFORT_EXPONENT);
  const score = value / cost;

  let reason: PriorityReason = null;
  if (streakRisk > 0 && proximity < 1) {
    reason = 'streak-at-risk';
  } else if (feasibility >= NOW_OR_NEVER_FEASIBILITY && proximity < 1) {
    reason = 'now-or-never';
  } else if (
    hoursUntilReset !== null &&
    hoursUntilReset <= EXPIRING_LABEL_WITHIN_HOURS &&
    input.kind !== 'leap' &&
    proximity < 1
  ) {
    reason = 'expiring';
  } else if (unitsRemaining === 1 && target > 1) {
    reason = 'last-step';
  } else if (proximity >= ALMOST_THERE_FRACTION && progress > 0) {
    reason = 'almost-there';
  }

  return {
    score,
    value,
    cost,
    reason,
    hoursUntilReset,
    proximity,
    deadlinePressure,
    feasibility,
    urgency,
    reward,
    streakRisk,
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
  return items
    .map((item) => ({ item, result: scoreQuestPriority(item, now) }))
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

export function priorityReasonLabel(
  result: PriorityResult,
  kind: PriorityKind = 'quest',
): string | null {
  if (result.reason === 'streak-at-risk') {
    return 'Streak at risk!';
  }
  if (result.reason === 'now-or-never') {
    return kind === 'leap' ? 'Last chance this week' : 'Last chance today';
  }
  if (result.reason === 'expiring') {
    return resetCountdownLabel(result.hoursUntilReset);
  }
  if (result.reason === 'last-step') {
    return 'One step left';
  }
  if (result.reason === 'almost-there') {
    return 'Almost there!';
  }
  return null;
}
