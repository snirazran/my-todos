import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { syncQuestState } from '@/lib/quests/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    const dashboard = await syncQuestState({
      userId,
      timezone,
      refreshDaily: true,
      dailySelectionSeed: `${Date.now()}`,
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
      dailyQuests: dashboard.dailyQuests.map(withCover),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not refresh quests' },
      { status: 400 },
    );
  }
}
