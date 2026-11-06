import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  DAILY_QUEST_REROLLS_PER_DAY,
  syncQuestState,
} from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { swapDailyPrompt } from '@/lib/prompts/daily';

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

    const nextCount = used + 1;
    await swapDailyPrompt({ userId, timezone, seed: `swap:${nextCount}` });
    user.dailyQuestReroll = { date: todayKey, count: nextCount };
    user.markModified('dailyQuestReroll');
    await user.save();

    const dashboard = await syncQuestState({ userId, timezone });

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
