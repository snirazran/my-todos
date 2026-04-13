import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimObjectiveReward } from '@/lib/quests/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const questId = String(body.questId ?? '');
    const objectiveId = String(body.objectiveId ?? '');
    const timezone = body.timezone || 'UTC';

    if (!questId || !objectiveId) {
      return NextResponse.json(
        { error: 'Invalid objective claim payload' },
        { status: 400 },
      );
    }

    await connectMongo();
    const rewardSummary = await claimObjectiveReward({
      userId,
      questId,
      objectiveId,
      timezone,
    });

    return NextResponse.json({
      ok: true,
      rewardSummary,
      questId,
      objectiveId,
    });
  } catch (error) {
    console.error('Objective claim failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Objective claim failed' },
      { status: 400 },
    );
  }
}
