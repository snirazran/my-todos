import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { StreakExtension } from './loginStreak';
import type { CheckInResult } from './types';

function streakTier(count: number) {
  if (count < 2) return 'none';
  if (count < 7) return '2_to_6';
  if (count < 30) return '7_to_29';
  return '30_plus';
}

export async function recordStreakExtended(args: {
  userId: string;
  dayKey: string;
  extension: StreakExtension;
}) {
  const { userId, dayKey, extension } = args;
  const flyAmount = extension.goalEvent?.rewardSummary.fliesGranted ?? 0;
  await Promise.all([
    recordAnalyticsEvent({
      userId,
      name: 'streak_checked_in',
      externalId: `streak_checked_in:${userId}:${dayKey}`,
      properties: {
        streak_length: extension.count,
        streak_tier: streakTier(extension.count),
        longest_streak: extension.longestStreak,
        extended: true,
        is_premium: extension.isPremium,
      },
    }),
    flyAmount > 0
      ? recordAnalyticsEvent({
          userId,
          name: 'fly_earned',
          properties: {
            source: 'login_streak',
            fly_amount: flyAmount,
            is_premium: extension.isPremium,
          },
        })
      : null,
  ]);
}

export async function recordShieldUsed(args: {
  userId: string;
  days: string[];
  shieldCount: number;
  streakLength: number;
  isPremium: boolean;
}) {
  await recordAnalyticsEvent({
    userId: args.userId,
    name: 'streak_shield_used',
    externalId: `streak_shield_used:${args.userId}:${args.days.join(',')}`,
    properties: {
      days_missed: args.days.length,
      shield_count: args.shieldCount,
      streak_length: args.streakLength,
      is_premium: args.isPremium,
    },
  });
}

export async function recordStreakBroken(args: {
  userId: string;
  count: number;
  lastDayKey: string;
  longestStreak: number;
  isPremium: boolean;
}) {
  await recordAnalyticsEvent({
    userId: args.userId,
    name: 'streak_broken',
    externalId: `streak_broken:${args.userId}:${args.lastDayKey}`,
    properties: {
      streak_length: args.count,
      streak_tier: streakTier(args.count),
      longest_streak: args.longestStreak,
      is_premium: args.isPremium,
    },
  });
}

export async function recordStreakEvaluated(args: {
  userId: string;
  result: CheckInResult;
  isPremium: boolean;
}) {
  const { userId, result, isPremium } = args;

  if (result.shieldConsumedDays.length && !result.extended) {
    await recordShieldUsed({
      userId,
      days: result.shieldConsumedDays,
      shieldCount: result.view?.shields ?? 0,
      streakLength: result.view?.count ?? 0,
      isPremium,
    });
  }

  if (result.brokeFrom > 0) {
    await recordStreakBroken({
      userId,
      count: result.brokeFrom,
      lastDayKey: result.view?.lastDayKey ?? '',
      longestStreak: result.view?.longestStreak ?? 0,
      isPremium,
    });
  }
}
