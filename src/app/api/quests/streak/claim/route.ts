import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimSweepRoll } from '@/lib/quests/streak';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    const rewardSummary = await claimSweepRoll({ userId, timezone });
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    const isPremium = !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();
    await recordAnalyticsEvent({
      userId,
      name: 'sweep_roll_claimed',
      properties: {
        roll_tier: rewardSummary.rolled.tier,
        mega: rewardSummary.rolled.mega,
        reward_amount: rewardSummary.fliesGranted,
        reward_count: rewardSummary.grantedItemIds.length + rewardSummary.grantedBackgroundIds.length,
        shields: rewardSummary.shieldsGranted,
        is_premium: isPremium,
      },
    });
    if (rewardSummary.fliesGranted > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'quest_sweep_roll',
          fly_amount: rewardSummary.fliesGranted,
          is_premium: isPremium,
        },
      });
    }

    return NextResponse.json({ ok: true, rewardSummary });
  } catch (error) {
    console.error('Reward roll claim failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reward roll claim failed' },
      { status: 400 },
    );
  }
}
