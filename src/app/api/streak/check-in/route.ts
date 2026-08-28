import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { performCheckIn } from '@/lib/streak/loginStreak';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

function streakTier(count: number, extended: boolean) {
  if (!extended || count < 2) return 'none';
  if (count < 7) return '2_to_6';
  if (count < 30) return '7_to_29';
  return '30_plus';
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    await connectMongo();
    const result = await performCheckIn({ userId, timezone });
    const flyAmount = result.goalEvent?.rewardSummary.fliesGranted ?? 0;
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    const isPremium = !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();

    if (flyAmount > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'login_streak',
          fly_amount: flyAmount,
          is_premium: isPremium,
        },
      });
    }

    if (result.view?.checkedInToday) {
      const count = result.view.count;
      await recordAnalyticsEvent({
        userId,
        name: 'streak_checked_in',
        externalId: `streak_checked_in:${userId}:${result.view.lastDayKey}`,
        properties: {
          streak_length: count,
          streak_tier: streakTier(count, result.extended),
          longest_streak: result.view.longestStreak,
          extended: result.extended,
          is_premium: isPremium,
        },
      });
    }

    if (result.shieldConsumedDays.length) {
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

    if (result.previousCount > 0 && !result.extended && (result.view?.count ?? 0) <= 1) {
      await recordAnalyticsEvent({
        userId,
        name: 'streak_broken',
        externalId: `streak_broken:${userId}:${result.view?.lastDayKey ?? ''}`,
        properties: {
          streak_length: result.previousCount,
          streak_tier: streakTier(result.previousCount, true),
          longest_streak: result.view?.longestStreak ?? 0,
          is_premium: isPremium,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Streak check-in failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check-in failed' },
      { status: 400 },
    );
  }
}
