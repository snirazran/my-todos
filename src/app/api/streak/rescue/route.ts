import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { consumeAdVerification } from '@/lib/rewards/admobSsv';
import { dismissRescue, performRescue } from '@/lib/streak/loginStreak';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const rescueId = String(body.rescueId ?? '');
    if (!rescueId) {
      return NextResponse.json({ error: 'Missing rescueId' }, { status: 400 });
    }
    await connectMongo();
    if (body.action === 'dismiss') {
      return NextResponse.json(await dismissRescue({ userId, rescueId }));
    }
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    if (
      !isPremiumActive(user?.premiumUntil) &&
      !(await consumeAdVerification(userId, 'streak_rescue'))
    ) {
      return NextResponse.json({
        granted: false,
        completed: false,
        error: 'unverified',
      });
    }
    const result = await performRescue({
      userId,
      timezone,
      rescueId,
      method: 'ad',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Streak rescue failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rescue failed' },
      { status: 400 },
    );
  }
}
