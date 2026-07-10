import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimQuestReward } from '@/lib/quests/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import UserModel from '@/lib/models/User';
import QuestModel from '@/lib/models/Quest';
import { questAnalyticsProperties } from '@/lib/analytics/engagement';

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
    const [quest, analyticsUser] = await Promise.all([
      QuestModel.findOne({ userId, questId: targetId }).lean(),
      UserModel.findById(userId).select('premiumUntil').lean(),
    ]);
    const autoClaimedObjectives = (quest?.logic ?? []).filter(
      (block) =>
        (block.rewards?.length ?? 0) > 0 &&
        block.progress >= block.target &&
        !(quest?.claimedObjectiveIds ?? []).includes(block.id),
    );
    const rewardSummary = await claimQuestReward({
      userId,
      claimType,
      targetId,
      timezone,
    });
    if (quest && autoClaimedObjectives.length > 0) {
      const multiplier =
        analyticsUser?.premiumUntil && new Date(analyticsUser.premiumUntil) > new Date()
          ? 2
          : 1;
      await Promise.all(autoClaimedObjectives.map((block) => {
        const rewards = block.rewards ?? [];
        const objectiveSummary = {
          fliesGranted: rewards
            .filter((reward) => reward.type === 'FLIES')
            .reduce((sum, reward) => sum + (reward.amount ?? 0) * multiplier, 0),
          grantedItemIds: rewards
            .filter((reward) => reward.type === 'ITEM' || reward.type === 'BOX')
            .flatMap((reward) => Array.from({ length: multiplier }, () => reward.itemId ?? 'item')),
          grantedBackgroundIds: rewards
            .filter((reward) => reward.type === 'BACKGROUND')
            .flatMap((reward) => Array.from({ length: multiplier }, () => reward.backgroundId ?? 'background')),
        };
        return recordAnalyticsEvent({
          userId,
          name: 'quest_objective_claimed',
          properties: questAnalyticsProperties(quest, objectiveSummary, block),
        });
      }));
    }
    if (rewardSummary.fliesGranted > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'quest_objective',
          fly_amount: rewardSummary.fliesGranted,
          is_premium: !!analyticsUser?.premiumUntil && new Date(analyticsUser.premiumUntil) > new Date(),
        },
      });
    }

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
