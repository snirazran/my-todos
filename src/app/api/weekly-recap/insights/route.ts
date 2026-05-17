export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import Anthropic from '@anthropic-ai/sdk';

export type RecapInsight = {
  emoji: string;
  title: string;
  body: string;
  type: 'strength' | 'improvement' | 'suggestion';
};

export type RecapInsightsResponse = {
  insights: RecapInsight[];
  summary: string;
};

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(uid).select('premiumUntil').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium =
      !!(user as any).premiumUntil &&
      new Date((user as any).premiumUntil) > new Date();

    if (!isPremium) {
      return NextResponse.json(
        { error: 'Premium required' },
        { status: 403 },
      );
    }

    const recapData = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI not configured' },
        { status: 500 },
      );
    }

    const prompt = buildInsightsPrompt(recapData);
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content =
      message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed: RecapInsightsResponse = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { insights: [], summary: '' };

      const insights = (parsed.insights ?? []).slice(0, 5).map((i) => ({
        emoji: String(i.emoji || '💡').slice(0, 2),
        title: String(i.title || '').slice(0, 60),
        body: String(i.body || '').slice(0, 200),
        type: (['strength', 'improvement', 'suggestion'].includes(i.type)
          ? i.type
          : 'suggestion') as RecapInsight['type'],
      }));

      return NextResponse.json({
        insights,
        summary: String(parsed.summary || '').slice(0, 300),
      });
    } catch {
      return NextResponse.json({ insights: [], summary: '' });
    }
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[weekly-recap/insights] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 },
    );
  }
}

function buildInsightsPrompt(data: any): string {
  const focusAreas = (data.focusAreas ?? [])
    .map(
      (a: any) =>
        `- ${a.categoryName}: ${a.tasksCompleted}/${a.tasksTotal} tasks, ${a.focusMinutes}min focused`,
    )
    .join('\n') || '(none)';

  const dayBreakdown = (data.days ?? [])
    .map(
      (d: any) =>
        `${d.dayName}: ${d.tasksCompleted}/${d.tasksTotal} tasks`,
    )
    .join('\n');

  const prevComparison = data.prevWeek
    ? `Previous week: ${data.prevWeek.tasksCompleted} tasks done (${data.prevWeek.completionRate}% rate), ${data.prevWeek.totalFocusMinutes}min focused, ${data.prevWeek.activeDays} active days`
    : 'No previous week data.';

  return `You are a personal productivity coach analyzing a user's weekly task data. Be encouraging but honest.

WEEKLY STATS:
- Tasks added: ${data.tasksAdded}, completed: ${data.tasksCompleted} (${data.completionRate}%)
- Active days: ${data.activeDays}/7
- Focus time: ${data.totalFocusMinutes} minutes
- Streak: ${data.currentStreak} consecutive days
- Flies earned: ${data.fliesEarned}

DAY BY DAY:
${dayBreakdown}

FOCUS AREAS:
${focusAreas}

WEEK-OVER-WEEK:
${prevComparison}

Generate 3-5 personalized insights. Mix strengths, areas for improvement, and actionable suggestions.
Focus on patterns: which days are weak, if too many tasks are added but not completed, if focus time is low, which areas are neglected.

Return ONLY raw JSON (no markdown, no backticks):
{
  "summary": "One sentence motivational summary of the week",
  "insights": [
    {
      "emoji": "🔥",
      "title": "Short headline (max 60 chars)",
      "body": "Specific, actionable insight (max 200 chars)",
      "type": "strength | improvement | suggestion"
    }
  ]
}`;
}
