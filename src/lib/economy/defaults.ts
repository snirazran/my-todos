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
  streakMilestones: {
    /** Streak-uplift payouts allowed per day, across all tasks. */
    dailyCap: number;
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
  streakMilestones: {
    dailyCap: 1,
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
  streakMilestones: {
    dailyCap: { min: 0, max: 50 },
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
        if (typeof fallback === 'boolean') {
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
