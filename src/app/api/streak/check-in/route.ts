import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { performCheckIn } from '@/lib/streak/loginStreak';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    await connectMongo();
    const result = await performCheckIn({ userId, timezone });
    const flyAmount = [
      ...result.milestoneEvents.map((event) => event.rewardSummary.fliesGranted ?? 0),
      result.goalEvent?.rewardSummary.fliesGranted ?? 0,
    ].reduce((sum, amount) => sum + amount, 0);
    if (flyAmount > 0) {
      const user = await UserModel.findById(userId).select('premiumUntil').lean();
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'login_streak',
          fly_amount: flyAmount,
          is_premium: !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
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
