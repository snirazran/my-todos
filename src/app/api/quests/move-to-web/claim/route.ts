import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimMoveToWebReward } from '@/lib/quests/moveToWeb';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST() {
  try {
    const userId = await requireUserId();

    await connectMongo();
    const rewardSummary = await claimMoveToWebReward({ userId });
    if (rewardSummary.fliesGranted > 0) {
      const user = await UserModel.findById(userId)
        .select('premiumUntil')
        .lean();
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'move_to_web',
          fly_amount: rewardSummary.fliesGranted,
          is_premium:
            !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, rewardSummary });
  } catch (error) {
    console.error('Move-to-web claim failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Claim failed',
      },
      { status: 400 },
    );
  }
}
