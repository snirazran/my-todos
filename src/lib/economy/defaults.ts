import {
  DEFAULT_CHECKLIST_TIERS,
  type ChecklistTier,
} from '@/lib/checklist';
import {
  DEFAULT_STREAK_MILESTONES,
  DEFAULT_STREAK_REPEAT,
  DEFAULT_STREAK_TIERS,
  type StreakMilestone,
  type StreakTier,
} from '@/lib/flyValue';

export type FlyEconomyConfig = {
  taskIncome: {
    /** Ceiling on everything a day of task completions can pay. */
    dailyCapFree: number;
    dailyCapPlus: number;
    /** Completions that pay flies at full rate; the rest fill the jar. */
    payingCompletionsPerDay: number;
    /** How far back a completion may be dated and still pay. */
    backdateGraceHours: number;
  };
  overflowJar: {
    enabled: boolean;
    pebblesPerCompletion: number;
    pebblesPerGift: number;
    giftsPerWeek: number;
    giftItemId: string;
  };
  checklist: {
    /** Length bands and where inside the list each band's flies are pinned. */
    tiers: ChecklistTier[];
  };
  taskStreak: {
    /** Per-completion rates; each REPLACES the base fly, never stacks with it. */
    tiers: StreakTier[];
    /** One-time payouts per task, at these streak lengths. */
    milestones: StreakMilestone[];
    /** After the last fixed milestone, a payout every this many days. */
    repeatEveryDays: number;
    repeatFlies: number;
    repeatGiftItemId: string;
    repeatShields: number;
    /** Milestone payouts a day, across all tasks; the rest queue to tomorrow. */
    milestonesPerDay: number;
    /** A repeating task forgives one missed day per this many days. */
    freeSlipEveryDays: number;
  };
  buddy: {
    /** Paid to BOTH sides on the second completion of a shared occurrence. */
    bonusFlies: number;
    /** Payouts a user may collect a day, across every pair. */
    dailyPayouts: number;
    /** Payouts one pair may collect a day — this is the two-account block. */
    perPairDailyPayouts: number;
    /** Shared completions with one buddy in a week that earn the Duo Week gift. */
    duoWeekTasks: number;
    duoWeekGiftItemId: string;
    /** Duo Week gifts a user may collect in a week, across every pair. */
    duoWeekPerWeek: number;
    /**
     * Whether the bonus draws from the day's task-income budget as well as its
     * own caps. Off means buddy flies sit outside the 30/day wall.
     */
    countsTowardTaskIncome: boolean;
  };
  friendsPond: {
    /** Every N tasks a friend completes generates `fliesPerGeneration` for you. */
    tasksPerGeneration: number;
    fliesPerGeneration: number;
    /** Your own completions today needed to open the pond at all. */
    claimGateTasks: number;
    dailyCapFree: number;
    dailyCapPlus: number;
    perFriendDailyCap: number;
    /** Unclaimed flies vanish after this long. */
    expiryHours: number;
    /** Claim from this many different friends... */
    weeklyBonusFriends: number;
    /** ...on this many days in a week, and the gift lands. */
    weeklyBonusDays: number;
    weeklyBonusGiftItemId: string;
    /** Flies the sender earns per friend cheered, first time each day. */
    cheerFlies: number;
    /** Cheers a day that pay the sender; extras still send, just unpaid. */
    cheerPaidPerDay: number;
  };
  invites: {
    monthlyCap: number;
  };
  rewardedAds: {
    reward: number;
    /** Views of the flat-fly placement a day; still bounded by `totalDailyCap`. */
    dailyCap: number;
    cooldownSeconds: number;
    /** Rewarded views a day across every placement combined. */
    totalDailyCap: number;
    doubleRewardPerDay: number;
    giftDoublePerDay: number;
    shopRerollPerDay: number;
    tradeRerollPerDay: number;
  };
  circuitBreaker: {
    /** Flies from every source combined, per user per day. */
    dailyCap: number;
  };
  timezone: {
    /** Accepted timezone changes per 24h; extras fall back to the stored zone. */
    changesPerDay: number;
  };
};

export const FLY_ECONOMY_DEFAULTS: FlyEconomyConfig = {
  taskIncome: {
    dailyCapFree: 30,
    dailyCapPlus: 30,
    payingCompletionsPerDay: 15,
    backdateGraceHours: 48,
  },
  overflowJar: {
    enabled: true,
    pebblesPerCompletion: 1,
    pebblesPerGift: 20,
    giftsPerWeek: 1,
    giftItemId: 'gift_box_1',
  },
  checklist: {
    tiers: DEFAULT_CHECKLIST_TIERS.map((tier) => ({
      ...tier,
      markers: [...tier.markers],
    })),
  },
  taskStreak: {
    tiers: [...DEFAULT_STREAK_TIERS],
    milestones: [...DEFAULT_STREAK_MILESTONES],
    repeatEveryDays: DEFAULT_STREAK_REPEAT.everyDays,
    repeatFlies: DEFAULT_STREAK_REPEAT.flies,
    repeatGiftItemId: DEFAULT_STREAK_REPEAT.giftItemId,
    repeatShields: DEFAULT_STREAK_REPEAT.shields,
    milestonesPerDay: 1,
    freeSlipEveryDays: 30,
  },
  buddy: {
    bonusFlies: 5,
    dailyPayouts: 3,
    perPairDailyPayouts: 2,
    duoWeekTasks: 5,
    duoWeekGiftItemId: 'gift_box_rare',
    duoWeekPerWeek: 1,
    countsTowardTaskIncome: false,
  },
  friendsPond: {
    tasksPerGeneration: 5,
    fliesPerGeneration: 2,
    claimGateTasks: 3,
    dailyCapFree: 20,
    dailyCapPlus: 40,
    perFriendDailyCap: 6,
    expiryHours: 48,
    weeklyBonusFriends: 3,
    weeklyBonusDays: 5,
    weeklyBonusGiftItemId: 'gift_box_rare',
    cheerFlies: 1,
    cheerPaidPerDay: 3,
  },
  invites: {
    monthlyCap: 10,
  },
  rewardedAds: {
    reward: 10,
    dailyCap: 6,
    cooldownSeconds: 60,
    totalDailyCap: 6,
    doubleRewardPerDay: 2,
    giftDoublePerDay: 2,
    shopRerollPerDay: 1,
    tradeRerollPerDay: 1,
  },
  circuitBreaker: {
    dailyCap: 400,
  },
  timezone: {
    changesPerDay: 1,
  },
};

type Bound = { min: number; max: number };

export const FLY_ECONOMY_LIMITS: Record<
  keyof FlyEconomyConfig,
  Record<string, Bound>
> = {
  taskIncome: {
    dailyCapFree: { min: 0, max: 1000 },
    dailyCapPlus: { min: 0, max: 1000 },
    payingCompletionsPerDay: { min: 0, max: 200 },
    backdateGraceHours: { min: 0, max: 24 * 30 },
  },
  overflowJar: {
    pebblesPerCompletion: { min: 0, max: 20 },
    pebblesPerGift: { min: 1, max: 500 },
    giftsPerWeek: { min: 0, max: 20 },
  },
  checklist: {},
  taskStreak: {
    repeatEveryDays: { min: 0, max: 365 },
    repeatFlies: { min: 0, max: 1000 },
    repeatShields: { min: 0, max: 5 },
    milestonesPerDay: { min: 0, max: 20 },
    freeSlipEveryDays: { min: 1, max: 365 },
  },
  buddy: {
    bonusFlies: { min: 0, max: 100 },
    dailyPayouts: { min: 0, max: 50 },
    perPairDailyPayouts: { min: 0, max: 20 },
    duoWeekTasks: { min: 0, max: 50 },
    duoWeekPerWeek: { min: 0, max: 10 },
  },
  friendsPond: {
    tasksPerGeneration: { min: 1, max: 100 },
    fliesPerGeneration: { min: 0, max: 100 },
    claimGateTasks: { min: 0, max: 50 },
    dailyCapFree: { min: 0, max: 500 },
    dailyCapPlus: { min: 0, max: 500 },
    perFriendDailyCap: { min: 0, max: 100 },
    expiryHours: { min: 1, max: 24 * 14 },
    weeklyBonusFriends: { min: 0, max: 50 },
    weeklyBonusDays: { min: 0, max: 7 },
    cheerFlies: { min: 0, max: 50 },
    cheerPaidPerDay: { min: 0, max: 50 },
  },
  invites: {
    monthlyCap: { min: 0, max: 1000 },
  },
  rewardedAds: {
    reward: { min: 0, max: 1000 },
    dailyCap: { min: 0, max: 100 },
    cooldownSeconds: { min: 0, max: 3600 },
    totalDailyCap: { min: 0, max: 100 },
    doubleRewardPerDay: { min: 0, max: 50 },
    giftDoublePerDay: { min: 0, max: 50 },
    shopRerollPerDay: { min: 0, max: 50 },
    tradeRerollPerDay: { min: 0, max: 50 },
  },
  circuitBreaker: {
    dailyCap: { min: 1, max: 100_000 },
  },
  timezone: {
    changesPerDay: { min: 1, max: 24 },
  },
};

function normalizeChecklistTiers(
  value: unknown,
  fallback: ChecklistTier[],
): ChecklistTier[] {
  if (!Array.isArray(value)) return fallback;
  const tiers = value
    .map((entry) => ({
      minItems: Math.max(1, Math.floor(Number((entry as any)?.minItems))),
      markers: Array.isArray((entry as any)?.markers)
        ? (entry as any).markers
            .map((marker: unknown) => String(marker ?? '').trim())
            .filter(Boolean)
            .slice(0, 10)
        : [],
    }))
    .filter((tier) => Number.isFinite(tier.minItems))
    .sort((a, b) => a.minItems - b.minItems);
  return tiers.length ? tiers : fallback;
}

function normalizeTiers(value: unknown, fallback: StreakTier[]): StreakTier[] {
  if (!Array.isArray(value)) return fallback;
  const tiers = value
    .map((entry) => ({
      minDays: Math.max(1, Math.floor(Number((entry as any)?.minDays))),
      flies: Math.max(0, Math.floor(Number((entry as any)?.flies))),
    }))
    .filter((tier) => Number.isFinite(tier.minDays) && Number.isFinite(tier.flies))
    .sort((a, b) => a.minDays - b.minDays);
  return tiers.length ? tiers : fallback;
}

function normalizeMilestones(
  value: unknown,
  fallback: StreakMilestone[],
): StreakMilestone[] {
  if (!Array.isArray(value)) return fallback;
  const milestones = value
    .map((entry) => {
      const atDays = Math.max(1, Math.floor(Number((entry as any)?.atDays)));
      const flies = Math.max(0, Math.floor(Number((entry as any)?.flies)));
      const giftItemId =
        typeof (entry as any)?.giftItemId === 'string' &&
        (entry as any).giftItemId.trim()
          ? String((entry as any).giftItemId).trim()
          : undefined;
      const shields = Math.max(
        0,
        Math.min(5, Math.floor(Number((entry as any)?.shields) || 0)),
      );
      return {
        atDays,
        flies,
        ...(giftItemId ? { giftItemId } : {}),
        ...(shields ? { shields } : {}),
      };
    })
    .filter((milestone) => Number.isFinite(milestone.atDays))
    .sort((a, b) => a.atDays - b.atDays);
  return milestones.length ? milestones : fallback;
}

function clampNumber(value: unknown, fallback: number, bound?: Bound): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  if (!bound) return Math.max(0, parsed);
  return Math.min(bound.max, Math.max(bound.min, parsed));
}

/**
 * Fold a stored/patch object onto the defaults. Anything missing, malformed or
 * out of range falls back to the default rather than disabling a cap — a bad
 * admin edit must never open the faucet.
 */
export function mergeFlyEconomyConfig(patch: unknown): FlyEconomyConfig {
  const source = (patch ?? {}) as Record<string, any>;
  const out = {} as FlyEconomyConfig;

  (Object.keys(FLY_ECONOMY_DEFAULTS) as (keyof FlyEconomyConfig)[]).forEach(
    (group) => {
      const defaults = FLY_ECONOMY_DEFAULTS[group] as Record<string, unknown>;
      const incoming = (source[group] ?? {}) as Record<string, unknown>;
      const bounds = FLY_ECONOMY_LIMITS[group] ?? {};
      const merged: Record<string, unknown> = {};

      Object.entries(defaults).forEach(([key, fallback]) => {
        const value = incoming[key];
        if (key === 'tiers' && group === 'checklist') {
          merged[key] = normalizeChecklistTiers(value, fallback as ChecklistTier[]);
        } else if (key === 'tiers') {
          merged[key] = normalizeTiers(value, fallback as StreakTier[]);
        } else if (key === 'milestones') {
          merged[key] = normalizeMilestones(value, fallback as StreakMilestone[]);
        } else if (typeof fallback === 'boolean') {
          merged[key] = typeof value === 'boolean' ? value : fallback;
        } else if (typeof fallback === 'number') {
          merged[key] = clampNumber(value, fallback, bounds[key]);
        } else {
          merged[key] =
            typeof value === 'string' && value.trim() ? value.trim() : fallback;
        }
      });

      (out as Record<string, unknown>)[group] = merged;
    },
  );

  return out;
}
