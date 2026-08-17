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
    bonusFlies: number;
    dailyCap: number;
    perPairDailyCap: number;
  };
  friendsPond: {
    dailyCapFree: number;
    dailyCapPlus: number;
    perFriendDailyCap: number;
    expiryHours: number;
  };
  invites: {
    monthlyCap: number;
  };
  rewardedAds: {
    reward: number;
    dailyCap: number;
    cooldownSeconds: number;
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
    bonusFlies: 1,
    dailyCap: 15,
    perPairDailyCap: 2,
  },
  friendsPond: {
    dailyCapFree: 20,
    dailyCapPlus: 40,
    perFriendDailyCap: 6,
    expiryHours: 48,
  },
  invites: {
    monthlyCap: 10,
  },
  rewardedAds: {
    reward: 10,
    dailyCap: 6,
    cooldownSeconds: 60,
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
  taskStreak: {
    repeatEveryDays: { min: 0, max: 365 },
    repeatFlies: { min: 0, max: 1000 },
    repeatShields: { min: 0, max: 5 },
    milestonesPerDay: { min: 0, max: 20 },
    freeSlipEveryDays: { min: 1, max: 365 },
  },
  buddy: {
    bonusFlies: { min: 0, max: 100 },
    dailyCap: { min: 0, max: 500 },
    perPairDailyCap: { min: 0, max: 50 },
  },
  friendsPond: {
    dailyCapFree: { min: 0, max: 500 },
    dailyCapPlus: { min: 0, max: 500 },
    perFriendDailyCap: { min: 0, max: 100 },
    expiryHours: { min: 1, max: 24 * 14 },
  },
  invites: {
    monthlyCap: { min: 0, max: 1000 },
  },
  rewardedAds: {
    reward: { min: 0, max: 1000 },
    dailyCap: { min: 0, max: 100 },
    cooldownSeconds: { min: 0, max: 3600 },
  },
  circuitBreaker: {
    dailyCap: { min: 1, max: 100_000 },
  },
  timezone: {
    changesPerDay: { min: 1, max: 24 },
  },
};

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
        if (key === 'tiers') {
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
