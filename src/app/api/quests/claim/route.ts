import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimQuestReward } from '@/lib/quests/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const claimType = body.claimType === 'category' ? 'category' : 'daily';
    const targetId = String(body.targetId ?? '');
    const timezone = body.timezone || 'UTC';

    if (!targetId) {
      return NextResponse.json(
        { error: 'Invalid quest claim payload' },
        { status: 400 },
      );
    }

    await connectMongo();
    const rewardSummary = await claimQuestReward({
      userId,
      claimType,
      targetId,
      timezone,
    });

    return NextResponse.json({
      ok: true,
      rewardSummary,
      targetId,
      claimType,
    });
  } catch (error) {
    console.error('Quest claim failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Quest claim failed' },
      { status: 400 },
    );
  }
}
