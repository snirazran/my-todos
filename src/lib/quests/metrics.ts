import QuestCounterModel from '@/lib/models/QuestCounter';
import { getZonedToday } from '@/lib/utils';

export type QuestMetricKey =
  | 'trade_completed'
  | 'skin_sold'
  | 'skin_acquired'
  | 'friend_invited'
  | 'buddy_task_completed'
  | 'task_streak_3'
  | 'task_saved_later'
  | 'skin_equipped'
  | 'frog_fed_full';

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
];

export async function bumpQuestMetric(args: {
  userId: string;
  metric: QuestMetricKey;
  amount?: number;
  timezone?: string;
}): Promise<void> {
  const { userId, metric } = args;
  const amount = args.amount ?? 1;
  if (!userId || amount === 0) return;
  const dateKey = getZonedToday(args.timezone || 'UTC');
  try {
    await QuestCounterModel.updateOne(
      { userId, metric, dateKey },
      { $inc: { count: amount } },
      { upsert: true },
    );
  } catch (err: any) {
    if (err?.code === 11000) {
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
}): Promise<{ metric: string; dateKey: string; count: number }[]> {
  const docs = await QuestCounterModel.find(
    { userId: args.userId, dateKey: { $gte: args.sinceDateKey } },
    { metric: 1, dateKey: 1, count: 1 },
  ).lean();
  return docs.map((d) => ({
    metric: d.metric,
    dateKey: d.dateKey,
    count: Math.max(0, d.count ?? 0),
  }));
}

export function sumCounters(
  counters: { metric: string; dateKey: string; count: number }[],
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
