import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimDailyStreakReward } from '@/lib/quests/streak';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    const rewardSummary = await claimDailyStreakReward({ userId, timezone });
    if (rewardSummary.fliesGranted > 0) {
      const user = await UserModel.findById(userId).select('premiumUntil').lean();
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'quest_streak',
          fly_amount: rewardSummary.fliesGranted,
          is_premium: !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, rewardSummary });
  } catch (error) {
    console.error('Streak claim failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Streak claim failed' },
      { status: 400 },
    );
  }
}
