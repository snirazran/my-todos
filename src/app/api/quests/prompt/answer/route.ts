import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { answerDailyPrompt } from '@/lib/prompts/daily';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const questId = typeof body?.questId === 'string' ? body.questId : '';
    const objectiveId = typeof body?.objectiveId === 'string' ? body.objectiveId : '';
    if (!questId || !objectiveId) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }
    const result = await answerDailyPrompt({
      userId,
      timezone: body?.timezone || 'UTC',
      questId,
      objectiveId,
      text: body?.text,
      optionId: body?.optionId,
    });
    await recordAnalyticsEvent({
      userId,
      name: 'daily_prompt_answered',
      properties: {
        prompt_id: result.promptId,
        prompt_kind: result.kind,
        fly_amount: result.rewardSummary?.fliesGranted ?? 0,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save your answer' },
      { status: 400 },
    );
  }
}
