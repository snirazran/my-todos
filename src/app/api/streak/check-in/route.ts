import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { performCheckIn } from '@/lib/streak/loginStreak';
import { recordStreakEvaluated } from '@/lib/streak/analytics';
import UserModel from '@/lib/models/User';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    await connectMongo();
    const result = await performCheckIn({ userId, timezone });
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    const isPremium = !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();
    await recordStreakEvaluated({ userId, result, isPremium });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Streak check-in failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check-in failed' },
      { status: 400 },
    );
  }
}
