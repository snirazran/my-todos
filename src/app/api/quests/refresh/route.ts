import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { syncQuestState } from '@/lib/quests/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = body.timezone || 'UTC';
    const scope = body.scope === 'focus' ? 'focus' : 'daily';

    await connectMongo();
    const dashboard = await syncQuestState({
      userId,
      timezone,
      refreshDaily: scope === 'daily',
      refreshFocus: scope === 'focus',
      dailySelectionSeed: scope === 'daily' ? `${Date.now()}` : undefined,
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
      scope,
      dailyQuests: dashboard.dailyQuests.map(withCover),
      categoryQuests: dashboard.categoryQuests.map(withCover),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not refresh quests' },
      { status: 400 },
    );
  }
}
