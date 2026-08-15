import { v4 as uuid } from 'uuid';
import PactModel, { type PactDoc } from '@/lib/models/Pact';
import PactConfigModel, { PACT_CONFIG_ID } from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart, weekDatesFor, weekOrder } from '@/lib/weekStart';
import { normalizeFocusProfile } from '@/lib/quests/engine';
import type { UserDoc } from '@/lib/types/UserDoc';
import {
  ensurePactConfig,
  newPactId,
  optionRewardFlies,
  planningWeekKey,
  scheduleLabel,
  shiftYMD,
} from './engine';

const TASK_TEXT_MAX = 80;

export type CommitPactInput = {
  userId: string;
  timezone: string;
  categoryId: string;
  text: string;
  days: number[];
  startTime: string;
  /** Per-day override, keyed by weekday number. Falls back to startTime. */
  dayTimes?: Record<number, string>;
  tagId?: string;
  suggestionId?: string;
  source: PactDoc['source'];
};

export type CommitPactResult = {
  pact: PactDoc;
  taskIds: string[];
  tagId: string;
  scheduleLabel: string;
  rewardFlies: number;
};

function sanitizeDays(days: unknown): number[] {
  const list = Array.isArray(days) ? days : [];
  const clean = Array.from(new Set(list.map(Number))).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  return clean.length > 0 ? clean.sort((a, b) => a - b) : [1, 3, 5];
}

function sanitizeTime(value: unknown): string {
  if (typeof value !== 'string') return '19:00';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '19:00';
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function resolveAreaTag(args: {
  userId: string;
  categoryId: string;
  accent: string;
  areaName: string;
  /** A tag the user picked on the confirm step; beats every other rule. */
  preferredTagId?: string;
}): Promise<string> {
  const { userId, categoryId, accent, areaName } = args;
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  const profile = normalizeFocusProfile(user.toObject() as UserDoc);
  const linked =
    profile.categoryTagMap.find((entry) => entry.categoryId === categoryId)
      ?.tagIds ?? [];
  const tags = (user.tags ?? []) as { id?: string; name?: string; color?: string }[];
  const existingIds = new Set(
    tags.map((t) => (typeof t === 'string' ? t : t?.id ?? t?.name)).filter(Boolean) as string[],
  );

  const preferred =
    args.preferredTagId && existingIds.has(args.preferredTagId)
      ? args.preferredTagId
      : null;
  const alive = preferred ?? linked.find((tagId) => existingIds.has(tagId));
  if (alive && alive === preferred) {
    // An explicit pick also becomes the area's link, so next week's pact and
    // the area's quest scoping both follow the tag the user actually chose.
    const nextLinked = Array.from(
      new Set([preferred, ...linked.filter((id) => existingIds.has(id))]),
    );
    user.focusProfile = {
      ...profile,
      categoryTagMap: [
        ...profile.categoryTagMap.filter(
          (entry) => entry.categoryId !== categoryId,
        ),
        { categoryId, tagIds: nextLinked },
      ],
    } as any;
    user.markModified('focusProfile');
    await user.save();
    return preferred;
  }
  if (alive) return alive;

  const byName = tags.find(
    (t) => (t?.name ?? '').toLowerCase() === areaName.toLowerCase(),
  );
  const tagId = byName?.id ?? uuid();
  if (!byName) {
    user.tags = [
      ...tags,
      { id: tagId, name: areaName.slice(0, 20), color: accent || '#22c55e' },
    ] as any;
    user.markModified('tags');
  }

  const nextMap = [
    ...profile.categoryTagMap.filter((entry) => entry.categoryId !== categoryId),
    {
      categoryId,
      tagIds: Array.from(
        new Set([...linked.filter((id) => existingIds.has(id)), tagId]),
      ),
    },
  ];
  user.focusProfile = {
    ...profile,
    categoryTagMap: nextMap,
  } as any;
  user.markModified('focusProfile');
  await user.save();
  return tagId;
}

export async function commitPact(
  input: CommitPactInput,
): Promise<CommitPactResult> {
  const { userId, timezone, categoryId, suggestionId, source } = input;
  await connectMongo();
  const config = await ensurePactConfig();
  const todayKey = getZonedToday(timezone);

  const user = await UserModel.findById(userId).lean<UserDoc | null>();
  if (!user) throw new Error('User not found');
  const nowHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const weekKey = planningWeekKey(
    todayKey,
    weekStartsOn,
    Number.isFinite(nowHour) ? nowHour : 0,
    config.pickHour ?? 18,
  );

  const existing = await PactModel.findOne({ userId, weekKey });
  if (existing && existing.status !== 'skipped') {
    throw new Error('You already have a pact for this week');
  }

  const category = await QuestCategoryModel.findOne({ categoryId }).lean();
  if (!category) throw new Error('Unknown area');

  const profile = normalizeFocusProfile(user);
  if (!profile.selectedCategoryIds.includes(categoryId)) {
    throw new Error('That area is not one of yours');
  }

  const text = String(input.text ?? '').trim().slice(0, TASK_TEXT_MAX);
  if (!text) throw new Error('Say what you will do');

  const rawDays = sanitizeDays(input.days);
  // The week's tasks are bounded by repeatEndDate, so a weekday already behind
  // us this week can never occur. Committing to it produced a target the user
  // could not physically reach, and the days that never appeared looked like
  // tasks that were never created.
  const weekDates = weekDatesFor(weekKey, weekStartsOn);
  const days = rawDays.filter((day) => {
    const index = weekOrder(weekStartsOn).indexOf(day as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    return index < 0 || weekDates[index] >= todayKey;
  });
  if (days.length === 0) {
    throw new Error('Those days already passed this week — pick a later day');
  }
  const startTime = sanitizeTime(input.startTime);

  const tagId = await resolveAreaTag({
    userId,
    categoryId,
    accent: category.accent,
    areaName: category.shortLabel || category.name,
    preferredTagId: input.tagId,
  });

  // A 6am gym slot and a 9pm wind-down are both reasonable in one week, so
  // days are grouped by the time they were given and each group is created
  // separately — one shared time stays the simple default.
  const timeForDay = (day: number) =>
    sanitizeTime(input.dayTimes?.[day] ?? startTime);
  const byTime = new Map<string, number[]>();
  for (const day of days) {
    const at = timeForDay(day);
    byTime.set(at, [...(byTime.get(at) ?? []), day]);
  }

  const { createTasksForUser } = await import('@/app/api/tasks/route');
  const taskIds: string[] = [];
  for (const [at, group] of Array.from(byTime.entries())) {
    const result = await createTasksForUser(
      userId,
      {
        text,
        days: group,
        tags: [tagId],
        startTime: at,
        reminder: 'at_time',
        repeat: 'weekly',
        repeatStartDate: weekKey,
        repeatEndDate: shiftYMD(weekKey, 6),
        timezone,
      },
      timezone,
    );
    if (!result.ok) throw new Error(result.error || 'Could not add the tasks');
    taskIds.push(...(result.ids ?? []));
  }

  if (existing) await PactModel.deleteOne({ _id: existing._id });

  const pact = await PactModel.create({
    userId,
    pactId: newPactId(),
    weekKey,
    categoryId,
    status: 'active',
    commitmentText: text,
    suggestionId,
    days,
    startTime,
    target: days.length,
    progress: 0,
    taskIds,
    tagId,
    source,
    shieldUsed: false,
  });

  // Committing a pact links the area's tag, which is exactly what the
  // "Start your weekly pact" onboarding step is waiting for.
  try {
    const { bumpQuestMetric } = await import('@/lib/quests/metrics');
    await bumpQuestMetric({ userId, metric: 'focus_tag_linked', timezone });
  } catch {
    // The pact is saved either way; the onboarding step can catch up later.
  }

  if (suggestionId) {
    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID, 'suggestions.id': suggestionId },
      { $inc: { 'suggestions.$.picked': 1 } },
    );
  }

  return {
    pact: pact.toObject() as PactDoc,
    taskIds,
    tagId,
    scheduleLabel: scheduleLabel(days, startTime),
    rewardFlies: optionRewardFlies(config, days),
  };
}

export async function releasePactTasks(args: {
  userId: string;
  pact: PactDoc;
}) {
  const { userId, pact } = args;
  if (!pact.taskIds?.length) return;
  await TaskModel.updateMany(
    { userId, id: { $in: pact.taskIds } },
    { $set: { deletedAt: new Date() } },
  );
}
