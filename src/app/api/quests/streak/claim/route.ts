import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimDailyStreakReward } from '@/lib/quests/streak';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    const rewardSummary = await claimDailyStreakReward({ userId, timezone });

    return NextResponse.json({ ok: true, rewardSummary });
  } catch (error) {
    console.error('Streak claim failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Streak claim failed' },
      { status: 400 },
    );
  }
}
