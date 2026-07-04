import QuestCounterModel from '@/lib/models/QuestCounter';
import { getZonedToday } from '@/lib/utils';

export type QuestMetricKey =
  | 'trade_completed'
  | 'skin_sold'
  | 'skin_acquired'
  | 'friend_invited'
  | 'buddy_task_completed'
  | 'task_saved_later'
  | 'skin_equipped'
  | 'frog_fed_full'
  | 'focus_tag_linked'
  | `task_streak_${number}`;

export const QUEST_METRIC_KEYS: QuestMetricKey[] = [
  'trade_completed',
  'skin_sold',
  'skin_acquired',
  'friend_invited',
  'buddy_task_completed',
  'task_streak_3',
  'task_saved_later',
  'skin_equipped',
  'frog_fed_full',
  'focus_tag_linked',
];

const TASK_STREAK_PATTERN = /^task_streak_(\d+)$/;

export function taskStreakMetric(days: number): QuestMetricKey {
  return `task_streak_${Math.max(2, Math.floor(days))}`;
}

export function parseTaskStreakDays(metricKey?: string): number | null {
  const match = metricKey ? TASK_STREAK_PATTERN.exec(metricKey) : null;
  return match ? Number(match[1]) : null;
}

export function isValidQuestMetricKey(metricKey: unknown): metricKey is QuestMetricKey {
  if (typeof metricKey !== 'string') return false;
  return (
    (QUEST_METRIC_KEYS as string[]).includes(metricKey) ||
    TASK_STREAK_PATTERN.test(metricKey)
  );
}

// Metrics whose source event is a task that carries tags; only these can be
// scoped to a focus category's tags.
export function isTagScopedQuestMetric(metricKey?: string) {
  return (
    metricKey === 'buddy_task_completed' ||
    (!!metricKey && TASK_STREAK_PATTERN.test(metricKey))
  );
}

export type QuestCounterEntry = {
  metric: string;
  dateKey: string;
  count: number;
  tagIds?: string[];
};

function buildTagKey(tagIds?: string[]) {
  if (!tagIds?.length) return '';
  return Array.from(new Set(tagIds.filter(Boolean))).sort().join(',');
}

export async function bumpQuestMetric(args: {
  userId: string;
  metric: QuestMetricKey;
  amount?: number;
  timezone?: string;
  tagIds?: string[];
}): Promise<void> {
  const { userId, metric } = args;
  const amount = args.amount ?? 1;
  if (!userId || amount === 0) return;
  const dateKey = getZonedToday(args.timezone || 'UTC');
  const tagKey = buildTagKey(args.tagIds);
  const tagIds = tagKey ? tagKey.split(',') : [];
  try {
    await QuestCounterModel.updateOne(
      { userId, metric, dateKey, tagKey },
      { $inc: { count: amount }, $set: { tagIds } },
      { upsert: true },
    );
  } catch (err: any) {
    if (err?.code === 11000) {
      // Either a concurrent upsert raced, or the legacy unique index (without
      // tagKey) is still on the collection — fall back to bumping whichever
      // row exists for the day so the global total stays right.
      await QuestCounterModel.updateOne(
        { userId, metric, dateKey },
        { $inc: { count: amount } },
      ).catch(() => {});
      return;
    }
    console.error('bumpQuestMetric failed', metric, err);
  }
}

export async function loadQuestCounters(args: {
  userId: string;
  sinceDateKey: string;
}): Promise<QuestCounterEntry[]> {
  const docs = await QuestCounterModel.find(
    { userId: args.userId, dateKey: { $gte: args.sinceDateKey } },
    { metric: 1, dateKey: 1, count: 1, tagIds: 1 },
  ).lean();
  return docs.map((d) => ({
    metric: d.metric,
    dateKey: d.dateKey,
    count: Math.max(0, d.count ?? 0),
    tagIds: d.tagIds ?? [],
  }));
}

export function sumCounters(
  counters: QuestCounterEntry[],
  metric: string,
  startDate: string,
  endDate: string,
): number {
  let sum = 0;
  for (const c of counters) {
    if (c.metric !== metric) continue;
    if (c.dateKey < startDate || c.dateKey > endDate) continue;
    sum += c.count;
  }
  return sum;
}

// Sum only events whose source task carried at least one of the given tags.
export function sumCountersForTags(
  counters: QuestCounterEntry[],
  metric: string,
  startDate: string,
  endDate: string,
  tagIds: string[],
): number {
  if (tagIds.length === 0) return 0;
  const wanted = new Set(tagIds);
  let sum = 0;
  for (const c of counters) {
    if (c.metric !== metric) continue;
    if (c.dateKey < startDate || c.dateKey > endDate) continue;
    if (!c.tagIds?.some((tagId) => wanted.has(tagId))) continue;
    sum += c.count;
  }
  return sum;
}
