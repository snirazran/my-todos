import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import WeeklyInsightModel from '@/lib/models/WeeklyInsight';
import { getZonedToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Cheap by construction: Haiku, a small prompt, a hard output cap, and at
 *  most one call per user per week (the row is keyed by week and read back on
 *  every later request). Worst case is a few hundred tokens per Plus user per
 *  week — the weekly cadence is the cost control, not a rate limiter. */
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 700;
/** Bump when the prompt or output shape changes — it's part of the cache key. */
const PROMPT_VERSION = 4;

const shiftDay = (dayKey: string, amount: number) => {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

/** ISO week key of the last full week, so everyone in a timezone shares one
 *  cache row and the note only changes when a new week actually closes. */
function weekKeyFor(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const safeTimezone = (value: string | null) => {
  const timezone = value || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return 'UTC';
  }
};

/** Two windows, kept apart on purpose. Only `thisWeek` describes the week
 *  being reviewed; everything under `longerTerm` is a multi-week aggregate. */
type Facts = {
  thisWeek: {
    completionRate: number;
    completionDelta: number;
    planned: number;
    completed: number;
    focusMinutes: number;
    activeDays: number;
    bestRun: number;
  };
  longerTerm: {
    windowDays: number;
    bestDay: string | null;
    hardestDay: string | null;
    topAreas: Array<{ name: string; rate: number; planned: number }>;
    slippingHabits: Array<{ title: string; rate: number }>;
    finishWindow: string | null;
    typicalTasks: number;
    lighterRate: number;
    heavierRate: number;
  };
};

const num = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

const str = (value: unknown, max = 60) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** The model only ever sees these aggregates — never task text, never notes. */
function sanitizeFacts(body: Record<string, unknown>): Facts {
  const week = (body.thisWeek ?? {}) as Record<string, unknown>;
  const long = (body.longerTerm ?? {}) as Record<string, unknown>;
  const areas = Array.isArray(long.topAreas) ? long.topAreas.slice(0, 4) : [];
  const habits = Array.isArray(long.slippingHabits) ? long.slippingHabits.slice(0, 3) : [];
  return {
    thisWeek: {
      completionRate: num(week.completionRate),
      completionDelta: num(week.completionDelta),
      planned: num(week.planned),
      completed: num(week.completed),
      focusMinutes: num(week.focusMinutes),
      activeDays: num(week.activeDays),
      bestRun: num(week.bestRun),
    },
    longerTerm: {
      windowDays: num(long.windowDays, 56),
      bestDay: str(long.bestDay, 12) || null,
      hardestDay: str(long.hardestDay, 12) || null,
      topAreas: areas.map((raw) => {
        const area = (raw ?? {}) as Record<string, unknown>;
        return { name: str(area.name, 32), rate: num(area.rate), planned: num(area.planned) };
      }),
      slippingHabits: habits.map((raw) => {
        const habit = (raw ?? {}) as Record<string, unknown>;
        return { title: str(habit.title, 48), rate: num(habit.rate) };
      }),
      finishWindow: str(long.finishWindow, 16) || null,
      typicalTasks: num(long.typicalTasks),
      lighterRate: num(long.lighterRate),
      heavierRate: num(long.heavierRate),
    },
  };
}

const SYSTEM = `You are the coach inside Frogress, a friendly task app whose mascot is a frog.
You are given one week of a single person's aggregated task statistics. Write their weekly review.

The data has TWO separate time windows. Mixing them up produces contradictions, so:
- "thisWeek" is the week you are reviewing. Only these numbers describe this week.
- "longerTerm" covers the last several weeks. Never state a longerTerm number as if it
  happened this week. If you use one, mark it as a longer-run pattern — "you usually…",
  "over the last few weeks…". If thisWeek.completed is 0, then nothing was completed this
  week, no matter what the longerTerm rates say.

Rules:
- Every number you state must come from the data given. Never invent a statistic, a trend, or a task.
- Speak to the person as "you". Warm, direct, never bubbly and never a lecture.
- No emoji. No markdown. No headings.
- If the data is thin, say so plainly instead of over-reading it.

People scan this card, they do not read it. So:
- "takeaway" is ONE sentence — the single most important thing about their week.
- "findings" are 2 or 3 separate observations. Each has a "label" of 2-4 words (the scannable part)
  and a "detail" of ONE short sentence. Do not repeat the takeaway. Each finding must add something
  new: a number, a comparison, or what it suggests.
- "focus" is one concrete thing to try next week.

Reply with JSON only, in this exact shape:
{"headline": "<max 7 words, specific to their week>", "takeaway": "<one sentence>", "findings": [{"label": "<2-4 words>", "detail": "<one sentence>"}], "focus": "<max 16 words>"}`;

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const user = await UserModel.findById(userId, { premiumUntil: 1, frogName: 1 }).lean<{
      premiumUntil?: Date;
      frogName?: string;
    }>();
    const isPlus = !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();
    if (!isPlus) {
      return NextResponse.json({ locked: true }, { status: 200 });
    }

    const timezone = safeTimezone(req.nextUrl.searchParams.get('timezone'));
    const weekKey = `${weekKeyFor(shiftDay(getZonedToday(timezone), -1))}-v${PROMPT_VERSION}`;

    const cached = await WeeklyInsightModel.findOne({ userId, weekKey }).lean();
    // A row missing the current fields (older shape, or a write that raced a
    // schema change) is regenerated rather than served — otherwise the client
    // waits forever for fields that will never arrive.
    if (cached?.headline && cached.takeaway && cached.findings?.length) {
      return NextResponse.json({
        locked: false,
        weekKey,
        headline: cached.headline,
        takeaway: cached.takeaway,
        findings: cached.findings,
        focus: cached.focus,
        cached: true,
      });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const facts = sanitizeFacts(body);
    if (facts.thisWeek.planned < 3) {
      return NextResponse.json({ locked: false, weekKey, tooEarly: true });
    }

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Their frog is named ${user?.frogName || 'Cookie'}.\n\nThis week's data:\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });

    const block = response.content[0];
    const raw = block?.type === 'text' ? block.text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ locked: false, weekKey, failed: true });
    }

    const parsed = JSON.parse(match[0]) as {
      headline?: string;
      takeaway?: string;
      findings?: Array<{ label?: string; detail?: string }>;
      focus?: string;
    };
    const headline = str(parsed.headline, 80);
    const takeaway = str(parsed.takeaway, 220);
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : [])
      .slice(0, 3)
      .map((raw) => ({ label: str(raw?.label, 40), detail: str(raw?.detail, 200) }))
      .filter((finding) => finding.label && finding.detail);
    const focus = str(parsed.focus, 160);
    if (!headline || !takeaway || !findings.length) {
      return NextResponse.json({ locked: false, weekKey, failed: true });
    }

    await WeeklyInsightModel.updateOne(
      { userId, weekKey },
      {
        $set: {
          headline,
          takeaway,
          findings,
          focus,
          model: MODEL,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        $setOnInsert: { userId, weekKey },
      },
      { upsert: true },
    );

    return NextResponse.json({
      locked: false,
      weekKey,
      headline,
      takeaway,
      findings,
      focus,
      cached: false,
    });
  } catch (error) {
    console.error('Weekly insight failed:', error);
    return NextResponse.json({ locked: false, failed: true });
  }
}
