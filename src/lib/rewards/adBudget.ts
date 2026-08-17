import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { loadFlyEconomyConfig, type FlyEconomyConfig } from '@/lib/economy/config';
import { storedEconomyTimezone } from '@/lib/economy/guards';
import { getZonedToday } from '@/lib/utils';

export const AD_PLACEMENTS = [
  'daily_flies',
  'reward_double',
  'gift_double',
  'shop_reroll',
  'trade_reroll',
] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export type AdBudgetState = {
  date: string;
  views: number;
  lastAt?: Date | string;
  byPlacement?: Record<string, number>;
};

export type AdBudgetRefusal = {
  ok: false;
  reason: 'premium' | 'cooldown' | 'placement_cap' | 'daily_cap';
  cooldownLeft: number;
  remaining: number;
  placementRemaining: number;
};

export type AdBudgetGrant = {
  ok: true;
  view: number;
  cooldownSeconds: number;
  remaining: number;
  placementRemaining: number;
};

export function placementCap(
  config: FlyEconomyConfig,
  placement: AdPlacement,
): number {
  const ads = config.rewardedAds;
  switch (placement) {
    case 'daily_flies':
      return ads.dailyCap;
    case 'reward_double':
      return ads.doubleRewardPerDay;
    case 'gift_double':
      return ads.giftDoublePerDay;
    case 'shop_reroll':
      return ads.shopRerollPerDay;
    case 'trade_reroll':
      return ads.tradeRerollPerDay;
    default:
      return 0;
  }
}

export function normalizeAdBudget(
  state: AdBudgetState | undefined,
  today: string,
): AdBudgetState {
  if (!state || state.date !== today) {
    return { date: today, views: 0, byPlacement: {} };
  }
  return {
    date: today,
    views: Math.max(0, Math.floor(Number(state.views) || 0)),
    lastAt: state.lastAt,
    byPlacement: state.byPlacement ?? {},
  };
}

export function adCooldownLeft(
  state: AdBudgetState | undefined,
  cooldownSeconds: number,
): number {
  if (!state?.lastAt || cooldownSeconds <= 0) return 0;
  const elapsed = Date.now() - new Date(state.lastAt).getTime();
  return Math.max(0, Math.ceil((cooldownSeconds * 1000 - elapsed) / 1000));
}

function readState(user: unknown): AdBudgetState | undefined {
  return (user as { adBudget?: AdBudgetState } | null)?.adBudget;
}

/** What the client should render, without spending a view. */
export async function readAdBudget(args: {
  userId: string;
  placement: AdPlacement;
  premium: boolean;
  tz?: string;
}) {
  const config = await loadFlyEconomyConfig();
  await connectMongo();
  const user = await UserModel.findById(args.userId)
    .select('adBudget')
    .lean();
  const tz = args.tz ?? (await storedEconomyTimezone(args.userId));
  const today = getZonedToday(tz);
  const state = normalizeAdBudget(readState(user), today);
  const cap = placementCap(config, args.placement);
  const used = state.byPlacement?.[args.placement] ?? 0;

  return {
    available: !args.premium,
    remaining: args.premium
      ? 0
      : Math.max(0, config.rewardedAds.totalDailyCap - state.views),
    placementRemaining: args.premium ? 0 : Math.max(0, cap - used),
    cooldownSeconds: config.rewardedAds.cooldownSeconds,
    cooldownLeft: adCooldownLeft(state, config.rewardedAds.cooldownSeconds),
    totalDailyCap: config.rewardedAds.totalDailyCap,
    placementCap: cap,
  };
}

/**
 * Spend one rewarded view against the shared daily budget. Rewarded ads are a
 * free-tier faucet — a subscriber is paying for their absence, so premium is
 * refused here rather than merely hidden in the UI. The compare-and-set on the
 * view count is what stops two ads finishing at once from spending one slot
 * twice.
 */
export async function consumeAdView(args: {
  userId: string;
  placement: AdPlacement;
  premium: boolean;
  tz?: string;
}): Promise<AdBudgetGrant | AdBudgetRefusal> {
  const config = await loadFlyEconomyConfig();
  const cooldownSeconds = config.rewardedAds.cooldownSeconds;

  if (args.premium) {
    return {
      ok: false,
      reason: 'premium',
      cooldownLeft: 0,
      remaining: 0,
      placementRemaining: 0,
    };
  }

  await connectMongo();
  const tz = args.tz ?? (await storedEconomyTimezone(args.userId));
  const today = getZonedToday(tz);

  const user = await UserModel.findById(args.userId).select('adBudget').lean();
  const state = normalizeAdBudget(readState(user), today);
  const cap = placementCap(config, args.placement);
  const used = state.byPlacement?.[args.placement] ?? 0;
  const totalRemaining = Math.max(
    0,
    config.rewardedAds.totalDailyCap - state.views,
  );
  const placementRemaining = Math.max(0, cap - used);
  const cooldownLeft = adCooldownLeft(state, cooldownSeconds);

  if (cooldownLeft > 0) {
    return {
      ok: false,
      reason: 'cooldown',
      cooldownLeft,
      remaining: totalRemaining,
      placementRemaining,
    };
  }
  if (placementRemaining <= 0) {
    return {
      ok: false,
      reason: 'placement_cap',
      cooldownLeft: 0,
      remaining: totalRemaining,
      placementRemaining: 0,
    };
  }
  if (totalRemaining <= 0) {
    return {
      ok: false,
      reason: 'daily_cap',
      cooldownLeft: 0,
      remaining: 0,
      placementRemaining,
    };
  }

  const next: AdBudgetState = {
    date: today,
    views: state.views + 1,
    lastAt: new Date(),
    byPlacement: { ...(state.byPlacement ?? {}), [args.placement]: used + 1 },
  };

  const applied = await UserModel.updateOne(
    {
      _id: args.userId,
      $or: [
        { 'adBudget.date': today, 'adBudget.views': state.views },
        { 'adBudget.date': { $ne: today } },
        { adBudget: { $exists: false } },
      ],
    },
    { $set: { adBudget: next } },
  );

  if (applied.modifiedCount === 0) {
    return {
      ok: false,
      reason: 'cooldown',
      cooldownLeft: cooldownSeconds,
      remaining: totalRemaining,
      placementRemaining,
    };
  }

  return {
    ok: true,
    view: next.views,
    cooldownSeconds,
    remaining: Math.max(0, config.rewardedAds.totalDailyCap - next.views),
    placementRemaining: Math.max(0, cap - (used + 1)),
  };
}

/** Hand a spent view back when the reward it paid for could not be granted. */
export async function refundAdView(args: {
  userId: string;
  placement: AdPlacement;
  tz?: string;
}): Promise<void> {
  await connectMongo();
  const tz = args.tz ?? (await storedEconomyTimezone(args.userId));
  const today = getZonedToday(tz);
  await UserModel.updateOne(
    { _id: args.userId, 'adBudget.date': today, 'adBudget.views': { $gt: 0 } },
    {
      $inc: {
        'adBudget.views': -1,
        [`adBudget.byPlacement.${args.placement}`]: -1,
      },
      $unset: { 'adBudget.lastAt': 1 },
    },
  );
}
