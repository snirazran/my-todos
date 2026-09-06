import type { PactDoc } from '@/lib/models/Pact';
import type { TaskDoc } from '@/lib/models/Task';
import { daysBetweenYMD } from '@/lib/weekStart';

export const AREA_ACTIVITY_WINDOW_DAYS = 28;
export const AREA_ACTIVITY_HALF_LIFE_DAYS = 7;
export const AREA_ACTIVE_SCORE = 0.5;
const PER_DAY_WEIGHT_CAP = 3;

export type AreaActivity = {
  categoryId: string;
  /** Every tag id a task can carry to count as this area's work. */
  tagIds: string[];
  /** There is at least one way to attribute a task to this area. */
  tracked: boolean;
  completions7: number;
  completions28: number;
  activeDays28: number;
  /** Half-life weighted completions; 0 means nothing recent. */
  score: number;
  lastActivityKey: string | null;
  quietDays: number | null;
};

export type AreaMembership = {
  categoryId: string;
  tagIds: string[];
  tagNames: string[];
  pactTaskIds: string[];
};

export function buildAreaMembership(args: {
  categoryIds: string[];
  categoryLabels: Map<string, string[]>;
  categoryTagMap: Array<{ categoryId: string; tagIds?: string[] }>;
  userTags: Array<{ id: string; name: string }>;
  pacts: Array<Pick<PactDoc, 'categoryId' | 'taskIds' | 'tagId'>>;
}): Map<string, AreaMembership> {
  const { categoryIds, categoryLabels, categoryTagMap, userTags, pacts } = args;
  const linkedByCategory = new Map(
    categoryTagMap.map((entry) => [entry.categoryId, entry.tagIds ?? []]),
  );
  const out = new Map<string, AreaMembership>();

  for (const categoryId of categoryIds) {
    const labels = (categoryLabels.get(categoryId) ?? []).map((label) =>
      label.trim().toLowerCase(),
    );
    const tagIds = new Set<string>();
    const tagNames = new Set<string>();

    for (const tagId of linkedByCategory.get(categoryId) ?? []) {
      if (!tagId) continue;
      tagIds.add(tagId);
      const known = userTags.find((tag) => tag.id === tagId);
      if (known?.name) tagNames.add(known.name.trim().toLowerCase());
    }
    for (const tag of userTags) {
      const name = tag.name.trim().toLowerCase();
      if (!name || !labels.includes(name)) continue;
      tagIds.add(tag.id);
      tagNames.add(name);
    }

    const pactTaskIds = new Set<string>();
    for (const pact of pacts) {
      if (pact.categoryId !== categoryId) continue;
      if (pact.tagId) tagIds.add(pact.tagId);
      for (const taskId of pact.taskIds ?? []) pactTaskIds.add(taskId);
    }

    out.set(categoryId, {
      categoryId,
      tagIds: Array.from(tagIds),
      tagNames: Array.from(tagNames),
      pactTaskIds: Array.from(pactTaskIds),
    });
  }

  return out;
}

function taskBelongsTo(task: TaskDoc, membership: AreaMembership) {
  if (task.focusAreaId && task.focusAreaId === membership.categoryId) return true;
  if (membership.pactTaskIds.includes(task.id)) return true;
  for (const value of task.tags ?? []) {
    if (!value) continue;
    if (membership.tagIds.includes(value)) return true;
    if (membership.tagNames.includes(value.trim().toLowerCase())) return true;
  }
  return false;
}

function decayWeight(ageDays: number) {
  return 0.5 ** (ageDays / AREA_ACTIVITY_HALF_LIFE_DAYS);
}

export function readAreaActivity(args: {
  memberships: Map<string, AreaMembership>;
  tasks: TaskDoc[];
  todayKey: string;
}): Map<string, AreaActivity> {
  const { memberships, tasks, todayKey } = args;
  const out = new Map<string, AreaActivity>();

  for (const membership of Array.from(memberships.values())) {
    const perDay = new Map<string, number>();
    let lastActivityKey: string | null = null;

    for (const task of tasks) {
      if (!taskBelongsTo(task, membership)) continue;
      for (const occurrence of task.completedDates ?? []) {
        if (!occurrence) continue;
        const day = occurrence > todayKey ? todayKey : occurrence;
        if (!lastActivityKey || day > lastActivityKey) lastActivityKey = day;
        const age = daysBetweenYMD(day, todayKey);
        if (age > AREA_ACTIVITY_WINDOW_DAYS) continue;
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
    }

    let completions7 = 0;
    let completions28 = 0;
    let score = 0;
    for (const [day, count] of Array.from(perDay.entries())) {
      const age = Math.max(0, daysBetweenYMD(day, todayKey));
      completions28 += count;
      if (age < 7) completions7 += count;
      score += Math.min(count, PER_DAY_WEIGHT_CAP) * decayWeight(age);
    }

    out.set(membership.categoryId, {
      categoryId: membership.categoryId,
      tagIds: membership.tagIds,
      tracked:
        membership.tagIds.length > 0 || membership.pactTaskIds.length > 0,
      completions7,
      completions28,
      activeDays28: perDay.size,
      score: Math.round(score * 100) / 100,
      lastActivityKey,
      quietDays: lastActivityKey
        ? Math.max(0, daysBetweenYMD(lastActivityKey, todayKey))
        : null,
    });
  }

  return out;
}

export function areaNeedScore(activity: AreaActivity) {
  return 100 / (1 + activity.score);
}

export function compareAreaNeed(a: AreaActivity, b: AreaActivity) {
  const byNeed = areaNeedScore(b) - areaNeedScore(a);
  if (Math.abs(byNeed) > 0.0001) return byNeed;
  const aQuiet = a.quietDays ?? Number.MAX_SAFE_INTEGER;
  const bQuiet = b.quietDays ?? Number.MAX_SAFE_INTEGER;
  if (aQuiet !== bQuiet) return bQuiet - aQuiet;
  return a.completions28 - b.completions28;
}
