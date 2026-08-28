import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import QuestModel from '@/lib/models/Quest';
import {
  DAILY_QUEST_REROLLS_PER_DAY,
  syncQuestState,
} from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    const user = await UserModel.findById(userId);
    if (!user) throw new Error('User not found');

    const todayKey = getZonedToday(timezone);
    const used =
      user.dailyQuestReroll?.date === todayKey
        ? Math.max(0, user.dailyQuestReroll.count ?? 0)
        : 0;
    if (used >= DAILY_QUEST_REROLLS_PER_DAY) {
      return NextResponse.json(
        {
          error: 'No swaps left today',
          rerollsLeft: 0,
        },
        { status: 429 },
      );
    }

    // Rerolling deletes today's quest doc, which is also where claim state
    // lives. Swapping after a payout would let the same reward be earned twice.
    const claimed = await QuestModel.exists({
      userId,
      placement: 'daily',
      windowKey: todayKey,
      $or: [
        { claimedAt: { $ne: null } },
        { claimedObjectiveIds: { $exists: true, $ne: [] } },
      ],
    });
    if (claimed) {
      return NextResponse.json(
        {
          error: 'Swap before claiming any of today’s rewards',
          rerollsLeft: Math.max(0, DAILY_QUEST_REROLLS_PER_DAY - used),
        },
        { status: 409 },
      );
    }

    const nextCount = used + 1;
    user.dailyQuestReroll = { date: todayKey, count: nextCount };
    user.markModified('dailyQuestReroll');
    await user.save();

    const dashboard = await syncQuestState({
      userId,
      timezone,
      refreshDaily: true,
      dailySelectionSeed: `reroll:${todayKey}:${nextCount}`,
    });

    await recordAnalyticsEvent({
      userId,
      name: 'daily_quest_swapped',
      externalId: `daily_quest_swapped:${userId}:${todayKey}:${nextCount}`,
      properties: {
        day_key: todayKey,
        count: nextCount,
        is_premium: !!user.premiumUntil && new Date(user.premiumUntil) > new Date(),
      },
    });

    const withCover = <T extends { templateId?: string; coverImageUrl?: string }>(
      quest: T,
    ): T =>
      quest.templateId && dashboard.templatesWithCover.has(quest.templateId)
        ? {
            ...quest,
            coverImageUrl: `/api/quests/cover?type=template&id=${encodeURIComponent(quest.templateId)}`,
          }
        : quest;

    return NextResponse.json({
      ok: true,
      rerollsLeft: Math.max(0, DAILY_QUEST_REROLLS_PER_DAY - nextCount),
      dailyQuests: dashboard.dailyQuests.map(withCover),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not refresh quests' },
      { status: 400 },
    );
  }
}
