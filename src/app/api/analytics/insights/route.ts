export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

type HistoryTaskInput = {
  text?: unknown;
  completed?: unknown;
  type?: unknown;
  tags?: unknown;
  frogodoroSession?: {
    timeSpent?: unknown;
    completedCycles?: unknown;
  };
};

type HistoryDayInput = {
  date?: unknown;
  tasks?: unknown;
};

export type AnalyticsCoachInsight = {
  title: string;
  body: string;
  evidence: string;
  action: string;
  type: 'strength' | 'weakness' | 'experiment';
};

export type AnalyticsCoachResponse = {
  summary: string;
  strongestPattern: string;
  biggestRisk: string;
  nextWeekPlan: string[];
  insights: AnalyticsCoachInsight[];
};

type TagInput = {
  id?: unknown;
  name?: unknown;
};

type SanitizedTask = {
  text: string;
  completed: boolean;
  type: 'regular' | 'weekly' | 'habit';
  tags: string[];
  focusMinutes: number;
};

type SanitizedDay = {
  date: string;
  tasks: SanitizedTask[];
};

type CoachPromptPayload = {
  dateRange: string;
  selectedTags: string[];
  days: SanitizedDay[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
};

const MAX_DAYS = 45;
const MAX_TASKS_PER_DAY = 24;

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI not configured' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const payload = buildPromptPayload(body);

    if (payload.days.length < 2 || payload.totalTasks < 3) {
      return NextResponse.json({
        summary: 'Not enough task history yet to diagnose a pattern.',
        strongestPattern: 'Add and complete a few more tasks to unlock a useful read.',
        biggestRisk: 'The coach needs multiple days of activity before it can avoid guessing.',
        nextWeekPlan: [
          'Use tasks and habits normally for a few more days.',
          'Come back after you have at least 3 completed or missed items.',
        ],
        insights: [],
      } satisfies AnalyticsCoachResponse);
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: buildCoachPrompt(payload) }],
    });

    const content =
      message.content[0].type === 'text' ? message.content[0].text : '';

    const parsed = parseCoachResponse(content);
    return NextResponse.json(parsed);
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[analytics/insights] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate analytics insights' },
      { status: 500 },
    );
  }
}

function buildPromptPayload(body: any): CoachPromptPayload {
  const rawDays = Array.isArray(body?.historyData) ? body.historyData : [];
  const tagLookup = buildTagLookup(body?.availableTags);
  const days = rawDays
    .slice(0, MAX_DAYS)
    .map((day: HistoryDayInput) => sanitizeDay(day, tagLookup))
    .filter((day: SanitizedDay) => day.date && day.tasks.length > 0);

  const totalTasks = days.reduce((sum: number, day: any) => sum + day.tasks.length, 0);
  const completedTasks = days.reduce(
    (sum: number, day: any) => sum + day.tasks.filter((task: any) => task.completed).length,
    0,
  );

  return {
    dateRange: String(body?.dateRange ?? 'custom').slice(0, 20),
    selectedTags: normalizeStringArray(body?.selectedTags).slice(0, 12),
    days,
    totalTasks,
    completedTasks,
    completionRate:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}

function buildTagLookup(tags: unknown) {
  const lookup = new Map<string, string>();
  if (!Array.isArray(tags)) return lookup;

  for (const tag of tags as TagInput[]) {
    const id = String(tag?.id ?? '');
    const name = String(tag?.name ?? '');
    if (id && name) lookup.set(id, name.slice(0, 40));
  }
  return lookup;
}

function sanitizeDay(day: HistoryDayInput, tagLookup: Map<string, string>): SanitizedDay {
  const date = String(day?.date ?? '').slice(0, 10);
  const tasks = Array.isArray(day?.tasks) ? day.tasks : [];

  return {
    date,
    tasks: tasks.slice(0, MAX_TASKS_PER_DAY).map((task: HistoryTaskInput) => {
      const tagIds = normalizeStringArray(task?.tags);
      const focusMs = Number(task?.frogodoroSession?.timeSpent ?? 0);
      const taskType = String(task?.type);
      return {
        text: String(task?.text ?? '').slice(0, 80),
        completed: Boolean(task?.completed),
        type: ['regular', 'weekly', 'habit'].includes(taskType)
          ? (taskType as SanitizedTask['type'])
          : 'regular',
        tags: tagIds.map((id) => tagLookup.get(id) ?? id).slice(0, 5),
        focusMinutes: Number.isFinite(focusMs) ? Math.round(focusMs / 60000) : 0,
      };
    }),
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function buildCoachPrompt(payload: CoachPromptPayload) {
  const dayLines = payload.days
    .map((day, index) => {
      const done = day.tasks.filter((task) => task.completed).length;
      const habits = day.tasks.filter((task) => task.type === 'habit');
      const habitDone = habits.filter((task) => task.completed).length;
      const focusMinutes = day.tasks.reduce((sum, task) => sum + task.focusMinutes, 0);
      const missed = day.tasks
        .filter((task) => !task.completed)
        .slice(0, 5)
        .map((task) => task.text)
        .join('; ');
      const completed = day.tasks
        .filter((task) => task.completed)
        .slice(0, 5)
        .map((task) => task.text)
        .join('; ');
      const tags = Array.from(new Set(day.tasks.flatMap((task) => task.tags))).join(', ');

      return [
        `day ${index + 1}: ${done} of ${day.tasks.length} tasks done, ${habitDone} of ${habits.length} habits done, focus ${focusMinutes}min`,
        tags ? `tags: ${tags}` : '',
        completed ? `completed examples: ${completed}` : '',
        missed ? `missed examples: ${missed}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    })
    .join('\n');

  return `You are a practical productivity analyst for a task and habit app.

Analyze the user's task history and produce premium-quality coaching. Do not write generic motivation. Make the output easy to scan inside a mobile app.

Rules:
- Be specific and honest.
- Prefer patterns across days, task types, habits, overplanning, recovery after missed days, consistency, and neglected areas.
- Do not invent data. If evidence is weak, say so and make the action small.
- The user should immediately understand what to do differently next week.
- Keep everything very short. No paragraphs.
- Never mention calendar dates.
- Never mention "day 1", "day 2", or internal day labels.
- Never use slash ratios like "3/5" or "2/4".
- Avoid percentages unless absolutely necessary.
- Do not combine two problems in one sentence.
- The summary must describe one overall theme, not multiple different patterns.
- biggestRisk must name one primary blocker only. Do not combine task load, habits, focus, tags, or family in one Fix line.
- Avoid cause words like "triggers", "proves", or "means".
- Avoid dramatic words like "cascading", "abandoned", "collapsed", "failure", "broken", or "sharply".
- Avoid vague labels like "heavy days"; say "long task lists" or "busy days" instead.
- Avoid dramatic claims about discipline, personality, or willpower.
- Do not repeat the same point in multiple sections.
- Each section has a different job:
  - strongestPattern = what already works
  - biggestRisk = what gets in the way
  - nextWeekPlan = 3 different app actions
  - insights[0] = one small experiment that does not repeat the task-count advice
- Use the app's actual tools in suggestions when relevant:
  - schedule a task or habit for a specific time
  - set how many times per week a habit should be done
  - add or adjust tags to separate areas like work, family, health, chores, or focus
  - reduce the number of tasks planned for heavy days
- Prefer simple commands like "Schedule", "Tag", "Lower", "Set", "Move".
- The single insight card should be a "Try" suggestion, not another diagnosis.
- Do not use the Try card for capping task count if the plan already mentions task count.
- Good Try examples:
  - title: "Schedule soft tasks"
  - body: "Open-ended reminders are easier to skip."
  - action: "Schedule one family task for a fixed time."
  - title: "Separate habits"
  - body: "Habits get buried when task lists are full."
  - action: "Set your key habit to 3 times per week."

RANGE: ${payload.dateRange}
TOTAL: ${payload.completedTasks} of ${payload.totalTasks} tasks completed.

DAILY HISTORY:
${dayLines}

Return ONLY raw JSON:
{
  "summary": "One plain sentence with one overall theme, max 80 chars",
  "strongestPattern": "What works, no numbers unless needed, max 70 chars",
  "biggestRisk": "One main blocker only, no numbers unless needed, max 70 chars",
  "nextWeekPlan": [
    "Concrete app action, max 58 chars",
    "Concrete app action, max 58 chars",
    "Concrete app action, max 58 chars"
  ],
  "insights": [
    {
      "title": "Short Try headline, max 34 chars",
      "body": "One short reason, max 70 chars",
      "evidence": "Optional tiny proof, max 45 chars",
      "action": "One concrete app action, max 65 chars",
      "type": "experiment"
    }
  ]
}`;
}

function parseCoachResponse(content: string): AnalyticsCoachResponse {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const insights = Array.isArray(parsed.insights) ? parsed.insights : [];

    const nextWeekPlan = normalizeStringArray(parsed.nextWeekPlan)
      .map((step) => cleanCoachText(step).slice(0, 75))
      .slice(0, 3);
    const cleanedInsights = insights
      .map((insight: any) => ({
        title: cleanCoachText(insight.title).slice(0, 45),
        body: cleanCoachText(insight.body).slice(0, 85),
        evidence: cleanCoachText(insight.evidence).slice(0, 60),
        action: cleanCoachText(insight.action).slice(0, 80),
        type: 'experiment' as AnalyticsCoachInsight['type'],
      }))
      .filter((insight: AnalyticsCoachInsight) =>
        !isDuplicateTaskCountSuggestion(insight, nextWeekPlan),
      )
      .slice(0, 1);

    return {
      summary: keepOneSubject(cleanCoachText(parsed.summary)).slice(0, 95),
      strongestPattern: cleanCoachText(parsed.strongestPattern).slice(0, 85),
      biggestRisk: keepOneSubject(cleanCoachText(parsed.biggestRisk)).slice(0, 85),
      nextWeekPlan,
      insights: cleanedInsights,
    };
  } catch {
    return {
      summary: '',
      strongestPattern: '',
      biggestRisk: '',
      nextWeekPlan: [],
      insights: [],
    };
  }
}

function isDuplicateTaskCountSuggestion(
  insight: AnalyticsCoachInsight,
  nextWeekPlan: string[],
) {
  const insightText = `${insight.title} ${insight.body} ${insight.action}`.toLowerCase();
  const planText = nextWeekPlan.join(' ').toLowerCase();
  const taskCountWords = ['task count', 'task list', 'tasks', 'items', 'cap', 'limit', 'maximum'];
  const insightMentionsTaskCount = taskCountWords.some((word) =>
    insightText.includes(word),
  );
  const planMentionsTaskCount = taskCountWords.some((word) =>
    planText.includes(word),
  );

  return insightMentionsTaskCount && planMentionsTaskCount;
}

function keepOneSubject(value: string) {
  const firstSentence = value.split(/[.!?]/)[0] ?? value;
  const firstClause = firstSentence
    .split(/\s(?:while|but|and|also)\s/i)[0]
    .split(';')[0]
    .trim();

  return firstClause || value;
}

function cleanCoachText(value: unknown) {
  return String(value ?? '')
    .replace(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}\b/gi,
      'a lighter day',
    )
    .replace(/\bday\s+\d+(?:'s)?\b/gi, 'one day')
    .replace(/\b(\d+)\/\1\b/g, 'all $1')
    .replace(/\b(\d+)\/(\d+)\b/g, '$1 of $2')
    .replace(/\btriggers\b/gi, 'often leads to')
    .replace(/\bcascading skips?\b/gi, 'missed tasks')
    .replace(/\babandoned\b/gi, 'missed')
    .replace(/\bcollapsed\b/gi, 'became less consistent')
    .replace(/\bfailure\b/gi, 'miss')
    .replace(/\bbroken\b/gi, 'harder to manage')
    .replace(/\bsharply\b/gi, '')
    .replace(/\bheavy days?\b/gi, 'busy days')
    .replace(/\s+/g, ' ')
    .trim();
}
