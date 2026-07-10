import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimObjectiveReward } from '@/lib/quests/engine';
import UserModel from '@/lib/models/User';
import QuestModel from '@/lib/models/Quest';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { questAnalyticsProperties } from '@/lib/analytics/engagement';

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
    const quest = await QuestModel.findOne({ userId, questId }).lean();
    const objective = quest?.logic?.find((block) => block.id === objectiveId);
    const rewardSummary = await claimObjectiveReward({
      userId,
      questId,
      objectiveId,
      timezone,
    });
    if (quest && objective) {
      await recordAnalyticsEvent({
        userId,
        name: 'quest_objective_claimed',
        properties: questAnalyticsProperties(quest, rewardSummary, objective),
      });
    }
    if (rewardSummary.fliesGranted > 0) {
      const user = await UserModel.findById(userId).select('premiumUntil').lean();
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'quest_objective',
          fly_amount: rewardSummary.fliesGranted,
          is_premium: !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
        },
      });
    }

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
