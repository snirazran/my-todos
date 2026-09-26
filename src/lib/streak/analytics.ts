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

export async function recordStreakEvaluated(args: {
  userId: string;
  result: CheckInResult;
  isPremium: boolean;
}) {
  const { userId, result, isPremium } = args;
  const dayKey = result.view?.lastDayKey ?? '';

  if (result.shieldConsumedDays.length && !result.extended) {
    await recordAnalyticsEvent({
      userId,
      name: 'streak_shield_used',
      externalId: `streak_shield_used:${userId}:${result.shieldConsumedDays.join(',')}`,
      properties: {
        days_missed: result.shieldConsumedDays.length,
        shield_count: result.view?.shields ?? 0,
        streak_length: result.view?.count ?? 0,
        is_premium: isPremium,
      },
    });
  }

  if (result.brokeFrom > 0) {
    await recordAnalyticsEvent({
      userId,
      name: 'streak_broken',
      externalId: `streak_broken:${userId}:${dayKey}`,
      properties: {
        streak_length: result.brokeFrom,
        streak_tier: streakTier(result.brokeFrom),
        longest_streak: result.view?.longestStreak ?? 0,
        is_premium: isPremium,
      },
    });
  }
}
