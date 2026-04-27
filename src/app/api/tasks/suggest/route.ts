import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import { getZonedToday } from '@/lib/utils';
import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

function usersCol() {
  return mongoose.connection.db!.collection('users');
}


const POOL_SIZE = 10;
const FREE_DAILY_REFRESHES = 2;

type AiSuggestion = {
  text: string;
  categoryId: string;
  tagIds?: string[];
};

type SuggestionCache = {
  pool: AiSuggestion[];
  usedTexts: string[];
  generatedDate: string;
  focusSignature?: string;
};

function getFocusSignature(focusProfile: any) {
  const selectedCategoryIds = (Array.isArray(focusProfile?.selectedCategoryIds)
    ? focusProfile.selectedCategoryIds
    : []
  )
    .map(String)
    .sort();
  const categoryTagMap = (Array.isArray(focusProfile?.categoryTagMap)
    ? focusProfile.categoryTagMap
    : []
  )
    .map((entry: any) => ({
      categoryId: String(entry.categoryId ?? ''),
      tagIds: (Array.isArray(entry.tagIds) ? entry.tagIds : [])
        .map(String)
        .sort(),
    }))
    .sort((a: { categoryId: string }, b: { categoryId: string }) =>
      a.categoryId.localeCompare(b.categoryId),
    );

  return JSON.stringify({ selectedCategoryIds, categoryTagMap });
}

async function getTodayTaskCount(uid: string, tz: string): Promise<number> {
  const todayDate = getZonedToday(tz);
  const todayDow = new Date(`${todayDate}T12:00:00Z`).getUTCDay();
  return TaskModel.countDocuments({
    userId: uid,
    deletedAt: { $exists: false },
    type: { $ne: 'habit' },
    $or: [
      { type: 'weekly', dayOfWeek: todayDow },
      { type: 'regular', date: todayDate },
    ],
  });
}

function getSuggestCount(todayTaskCount: number): number {
  return todayTaskCount === 0 ? 5 : todayTaskCount === 1 ? 4 : 3;
}

async function generatePool(
  uid: string,
  tz: string,
  focusProfile: any,
  selectedCategoryIds: string[],
): Promise<AiSuggestion[]> {
  const todayDate = getZonedToday(tz);
  const todayDow = new Date(`${todayDate}T12:00:00Z`).getUTCDay();
  const weekStart = getWeekStartDate(tz);

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
  if (!apiKey) return [];

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const content =
    message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const raw: AiSuggestion[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const pool = raw.slice(0, POOL_SIZE).map((s) => ({
      text: String(s.text || '').slice(0, 45),
      categoryId: String(s.categoryId || ''),
      tagIds: categoryTagIdMap[String(s.categoryId || '')] ?? [],
    }));
    // Shuffle once so the stored order is randomized
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  } catch {
    return [];
  }
}

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
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

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
    const refreshesToday = refreshTracker.date === todayStr ? refreshTracker.count : 0;
    const refreshesLeft = isPremium ? Infinity : Math.max(0, FREE_DAILY_REFRESHES - refreshesToday);

    if (selectedCategoryIds.length === 0) {
      return NextResponse.json({ suggestions: [], cached: false, isPremium, refreshesLeft });
    }

    const focusSignature = getFocusSignature(focusProfile);

    let cache: SuggestionCache | undefined = (user as any).aiSuggestionCache;
    let cached = true;

    const needsNewPool =
      !cache ||
      cache.generatedDate !== todayStr ||
      cache.focusSignature !== focusSignature;

    if (needsNewPool) {
      cached = false;
      const pool = await generatePool(uid, tz, focusProfile, selectedCategoryIds);
      cache = {
        pool,
        usedTexts: [],
        generatedDate: todayStr,
        focusSignature,
      };
      const user2 = await UserModel.findById(uid).select('_id').lean();
      await usersCol().updateOne(
        { _id: user2!._id },
        { $set: { aiSuggestionCache: cache } },
      );
    }

    const available = cache!.pool.filter(
      (s) => !cache!.usedTexts.includes(s.text),
    );

    const todayTaskCount = await getTodayTaskCount(uid, tz);
    const suggestCount = getSuggestCount(todayTaskCount);

    // Pick random indices, then sort them to preserve pool order
    const indices = available.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const picked = indices.slice(0, suggestCount).sort((a, b) => a - b);
    const suggestions = picked.map((i) => available[i]);

    return NextResponse.json({
      suggestions,
      cached,
      isPremium,
      refreshesLeft,
    });
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

// Force refresh (regenerates the pool)
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

    const user2 = await UserModel.findById(uid).select('_id').lean();
    await usersCol().updateOne(
      { _id: user2!._id },
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

// Mark a suggestion as used (accepted or dismissed)
export async function PATCH(req: Request) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const user = await UserModel.findById(uid).select('_id').lean();
    await usersCol().updateOne(
      { _id: user!._id },
      { $addToSet: { 'aiSuggestionCache.usedTexts': text } },
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
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

Suggest EXACTLY ${POOL_SIZE} new tasks (you MUST return all ${POOL_SIZE}) that:
- Help them make progress on their focus areas
- Spread suggestions across ALL of the user's focus areas, not just one
- Are time-appropriate (morning tasks if morning, evening tasks if evening, etc.)
- Do NOT duplicate or closely resemble any existing task or habit above
- Are specific and actionable, not generic advice
- Each task text MUST be 45 characters or fewer

Return ONLY a raw JSON array with exactly ${POOL_SIZE} items. No markdown, no backticks, no explanation:
[{"text":"short task","categoryId":"focus_area_id"}]`;
}
