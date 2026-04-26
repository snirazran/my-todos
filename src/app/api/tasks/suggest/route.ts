import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SUGGESTIONS = 5;
const FREE_DAILY_REFRESHES = 2;

type AiSuggestion = {
  text: string;
  categoryId: string;
  tagIds?: string[];
};

type SuggestionCache = {
  suggestions: AiSuggestion[];
  generatedAt: string;
  weekStart: string;
};

function getWeekStartDate(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  const today = new Date(todayStr + 'T00:00:00');
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  today.setDate(today.getDate() + mondayOffset);
  return today.toISOString().split('T')[0];
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const tz = searchParams.get('timezone') || 'UTC';
    const weekStart = getWeekStartDate(tz);

    const user = await UserModel.findById(uid).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const focusProfile = (user as any).focusProfile;
    const selectedCategoryIds: string[] =
      focusProfile?.selectedCategoryIds ?? [];
    const isPremium = !!(user as any).premiumUntil &&
      new Date((user as any).premiumUntil) > new Date();

    const refreshTracker = (user as any).aiSuggestionRefreshes ?? { date: '', count: 0 };
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const refreshesToday = refreshTracker.date === todayStr ? refreshTracker.count : 0;
    const refreshesLeft = isPremium ? Infinity : Math.max(0, FREE_DAILY_REFRESHES - refreshesToday);

    if (selectedCategoryIds.length === 0) {
      return NextResponse.json({ suggestions: [], cached: false, isPremium, refreshesLeft });
    }

    // Check cache
    const cached: SuggestionCache | undefined = (user as any).aiSuggestionCache;
    if (
      cached &&
      cached.weekStart === weekStart &&
      cached.generatedAt &&
      Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL_MS
    ) {
      return NextResponse.json({
        suggestions: cached.suggestions,
        cached: true,
        isPremium,
        refreshesLeft,
      });
    }

    // Fetch current week tasks
    const tasks = await TaskModel.find({
      userId: uid,
      deletedAt: { $exists: false },
      $or: [
        { type: 'weekly' },
        { type: 'habit' },
        { type: 'regular', weekStart },
        { type: 'backlog' },
      ],
    })
      .select('text type tags dayOfWeek completed')
      .lean();

    const habitTasks = tasks.filter((t: any) => t.type === 'habit');
    const regularTasks = tasks.filter((t: any) => t.type !== 'habit');
    const habitTexts = habitTasks.map((t: any) => t.text);
    const taskTexts = regularTasks.map((t: any) => t.text);

    const categories = selectedCategoryIds
      .map((id: string) => QUEST_MACRO_CATEGORIES.find((c) => c.id === id))
      .filter(Boolean);

    const categoryTagIdMap: Record<string, string[]> = {};
    for (const entry of focusProfile?.categoryTagMap ?? []) {
      if (entry.tagIds?.length) {
        categoryTagIdMap[entry.categoryId] = entry.tagIds;
      }
    }

    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
    });
    const currentTime = timeFormatter.format(now);
    const currentDay = dayFormatter.format(now);

    const prompt = buildPrompt(taskTexts, habitTexts, categories, currentTime, currentDay);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let suggestions: AiSuggestion[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      suggestions = suggestions.slice(0, MAX_SUGGESTIONS).map((s) => ({
        text: String(s.text || '').slice(0, 45),
        categoryId: String(s.categoryId || ''),
        tagIds: categoryTagIdMap[String(s.categoryId || '')] ?? [],
      }));
    } catch {
      suggestions = [];
    }

    // Cache in user doc
    const cachePayload: SuggestionCache = {
      suggestions,
      generatedAt: new Date().toISOString(),
      weekStart,
    };
    await UserModel.updateOne(
      { _id: uid },
      { $set: { aiSuggestionCache: cachePayload } },
    );

    return NextResponse.json({ suggestions, cached: false, isPremium, refreshesLeft });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[suggest] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 },
    );
  }
}

// Force refresh (clears cache)
export async function POST(req: Request) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const tz = searchParams.get('timezone') || 'UTC';
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

    const user = await UserModel.findById(uid).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium = !!(user as any).premiumUntil &&
      new Date((user as any).premiumUntil) > new Date();

    if (!isPremium) {
      const refreshTracker = (user as any).aiSuggestionRefreshes ?? { date: '', count: 0 };
      const refreshesToday = refreshTracker.date === todayStr ? refreshTracker.count : 0;
      if (refreshesToday >= FREE_DAILY_REFRESHES) {
        return NextResponse.json(
          { error: 'limit', refreshesLeft: 0, isPremium: false },
          { status: 403 },
        );
      }
    }

    const refreshTracker = (user as any).aiSuggestionRefreshes ?? { date: '', count: 0 };
    const isNewDay = refreshTracker.date !== todayStr;
    const newCount = isNewDay ? 1 : refreshTracker.count + 1;

    await UserModel.updateOne(
      { _id: uid },
      {
        $unset: { aiSuggestionCache: 1 },
        $set: { aiSuggestionRefreshes: { date: todayStr, count: newCount } },
      },
    );

    return GET(req);
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 });
  }
}

function buildPrompt(
  existingTasks: string[],
  habits: string[],
  categories: any[],
  currentTime: string,
  currentDay: string,
): string {
  const categoryInfo = categories
    .map((c: any) => `- ${c.name} [id: ${c.id}]`)
    .join('\n');

  const taskList =
    existingTasks.length > 0
      ? existingTasks.map((t) => `- ${t}`).join('\n')
      : '(none yet)';

  const habitList =
    habits.length > 0
      ? habits.map((t) => `- ${t}`).join('\n')
      : '(none)';

  return `You are a personal productivity coach helping a user achieve their goals. It is currently ${currentDay}, ${currentTime}.

The user chose these focus areas to improve in:
${categoryInfo}

Their recurring habits:
${habitList}

Their tasks this week:
${taskList}

Suggest ${MAX_SUGGESTIONS} new tasks that:
- Help them make progress on their focus areas
- Are time-appropriate (morning tasks if morning, evening tasks if evening, etc.)
- Do NOT duplicate or closely resemble any existing task or habit above
- Are specific and actionable, not generic advice
- Each task text MUST be 45 characters or fewer

Return ONLY a raw JSON array. No markdown, no backticks, no explanation:
[{"text":"short task","categoryId":"focus_area_id"}]`;
}
