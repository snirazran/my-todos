export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { commitPact } from '@/lib/pact/commit';
import { getPactView } from '@/lib/pact/engine';
import { notifyTaskChanged } from '@/lib/taskSync';
import { syncQuestState } from '@/lib/quests/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const categoryId = String(body.categoryId ?? '').trim();
    const text = String(body.text ?? '').trim();
    if (!categoryId || !text) {
      return NextResponse.json(
        { error: 'Pick an area and say what you will do' },
        { status: 400 },
      );
    }

    await connectMongo();
    const result = await commitPact({
      userId,
      timezone,
      categoryId,
      text,
      days: body.days,
      startTime: body.startTime,
      dayTimes:
        body.dayTimes && typeof body.dayTimes === 'object' ? body.dayTimes : undefined,
      tagId: typeof body.tagId === 'string' ? body.tagId : undefined,
      suggestionId:
        typeof body.suggestionId === 'string' && !body.suggestionId.startsWith('repeat-')
          ? body.suggestionId
          : undefined,
      source:
        body.source === 'custom' ||
        body.source === 'repeat' ||
        body.source === 'generated'
          ? body.source
          : 'library',
    });

    await notifyTaskChanged(userId);
    void syncQuestState({ userId, timezone, includeCatalog: false }).catch(() => {});
    await recordAnalyticsEvent({
      userId,
      name: 'pact_committed',
      properties: {
        category_id: categoryId,
        days: result.pact.days.length,
        source: result.pact.source,
        has_time: !!result.pact.startTime,
      },
    });

    const view = await getPactView({ userId, timezone });
    return NextResponse.json({
      ok: true,
      scheduleLabel: result.scheduleLabel,
      rewardFlies: result.rewardFlies,
      taskCount: result.taskIds.length,
      view,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not save your pact',
      },
      { status: 400 },
    );
  }
}
