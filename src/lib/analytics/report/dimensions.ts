import type { PipelineStage } from 'mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import type { StatTable } from '@/lib/analytics/catalog';
import { rate, round } from './context';

export type MixRow = {
  _id: { key: string; value: string | number | boolean };
  count: number;
  users: number;
};

export const PROPERTY_LABELS: Record<string, string> = {
  task_type: 'Task type',
  tag_count: 'Tags per task',
  focus_tag_count: 'Focus tags per task',
  focus_connected: 'Connected to a focus area',
  buddy: 'Buddy task',
  recurring: 'Repeating task',
  repeat_mode: 'Repeat mode',
  checklist_count: 'Checklist items',
  has_schedule: 'Has a scheduled time',
  has_reminder: 'Has a reminder',
  streak_tier: 'Task streak tier',
  streak_length: 'Task streak length',
  phase: 'Timer phase',
  duration_minutes: 'Duration (minutes)',
  focus_duration_minutes: 'Focus length (minutes)',
  break_duration_minutes: 'Break length (minutes)',
  auto_start_breaks: 'Auto-start breaks',
  completed_seconds: 'Seconds completed',
  quest_placement: 'Quest surface',
  quest_category: 'Quest category',
  quest_generation: 'Authored or generated',
  quest_tier: 'Slot',
  objective_count: 'Objectives per quest',
  objective_type: 'Objective type',
  objective_subject: 'Objective subject',
  objective_action: 'Objective action',
  objective_tag_mode: 'Objective tag scope',
  objective_metric: 'Objective metric',
  objective_target: 'Objective target',
  reward_type: 'Reward type',
  reward_amount: 'Flies awarded',
  reward_count: 'Items awarded',
  reward_day: 'Calendar day',
  premium_reward_included: 'Plus reward included',
  season_id: 'Season',
  season_day: 'Season day',
  is_premium: 'Account tier',
  count: 'Tasks per action',
  source: 'Source',
  slot: 'Slot',
  rarity: 'Rarity',
  from_rarity: 'Traded from',
  to_rarity: 'Traded to',
  placement: 'Placement',
  method: 'Share method',
  notification_type: 'Notification type',
  streak_length_bucket: 'Streak length',
  provider: 'Provider',
  reason: 'Reason',
};

const AVERAGE_KEYS = new Set([
  'tag_count',
  'focus_tag_count',
  'checklist_count',
  'streak_length',
  'duration_minutes',
  'focus_duration_minutes',
  'break_duration_minutes',
  'completed_seconds',
  'objective_count',
  'objective_target',
  'reward_amount',
  'reward_count',
  'count',
]);

export function isAverageKey(key: string) {
  return AVERAGE_KEYS.has(key);
}

export async function propertyMix(
  match: PipelineStage.Match['$match'],
  keys: string[],
): Promise<MixRow[]> {
  if (!keys.length) return [];
  return AnalyticsEventModel.aggregate<MixRow>([
    { $match: match },
    { $project: { userId: 1, property: { $objectToArray: { $ifNull: ['$properties', {}] } } } },
    { $unwind: '$property' },
    { $match: { 'property.k': { $in: keys } } },
    {
      $group: {
        _id: { key: '$property.k', value: '$property.v' },
        count: { $sum: 1 },
        userSet: { $addToSet: '$userId' },
      },
    },
    { $project: { count: 1, users: { $size: '$userSet' } } },
    { $sort: { count: -1 } },
  ]);
}

export function readableValue(key: string, value: string | number | boolean) {
  if (key === 'is_premium') return value ? 'Plus' : 'Free';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'completed_seconds' && typeof value === 'number') {
    return `${round(value / 60, 1)} min`;
  }
  return String(value);
}

export function mixTable(options: {
  key: string;
  title: string;
  question: string;
  rows: MixRow[];
  total: number;
  order?: string[];
  rename?: Record<string, string>;
  note?: string;
  countLabel?: string;
}): StatTable {
  const grouped = new Map<string, MixRow[]>();
  for (const row of options.rows) {
    if (isAverageKey(row._id.key)) continue;
    const bucket = grouped.get(row._id.key) ?? [];
    bucket.push(row);
    grouped.set(row._id.key, bucket);
  }

  const order = options.order ?? Array.from(grouped.keys());
  const rows = order
    .filter((key) => grouped.has(key))
    .flatMap((key) =>
      (grouped.get(key) ?? [])
        .sort((a, b) => b.count - a.count)
        .map((row) => ({
          dimension: PROPERTY_LABELS[key] ?? key,
          value: options.rename?.[String(row._id.value)] ?? readableValue(key, row._id.value),
          events: row.count,
          users: row.users,
          share: rate(row.count, options.total),
        })),
    );

  return {
    key: options.key,
    title: options.title,
    question: options.question,
    columns: [
      { key: 'dimension', label: 'Dimension' },
      { key: 'value', label: 'Value' },
      { key: 'events', label: options.countLabel ?? 'Events', format: 'integer' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'share', label: 'Share', format: 'percent' },
    ],
    rows,
    note: options.note,
  };
}

export function averagesFrom(rows: MixRow[]) {
  const totals = new Map<string, { weighted: number; samples: number }>();
  for (const row of rows) {
    if (!isAverageKey(row._id.key)) continue;
    if (typeof row._id.value !== 'number') continue;
    const bucket = totals.get(row._id.key) ?? { weighted: 0, samples: 0 };
    bucket.weighted += row._id.value * row.count;
    bucket.samples += row.count;
    totals.set(row._id.key, bucket);
  }
  return Array.from(totals, ([key, bucket]) => ({
    key,
    label: PROPERTY_LABELS[key] ?? key,
    average: bucket.samples ? round(bucket.weighted / bucket.samples, 2) : 0,
    total: round(bucket.weighted, 2),
    samples: bucket.samples,
  }));
}

export function averagesTable(options: {
  key: string;
  title: string;
  question: string;
  rows: MixRow[];
  note?: string;
}): StatTable {
  return {
    key: options.key,
    title: options.title,
    question: options.question,
    columns: [
      { key: 'measure', label: 'Measure' },
      { key: 'average', label: 'Average', format: 'decimal' },
      { key: 'total', label: 'Total', format: 'decimal' },
      { key: 'samples', label: 'Samples', format: 'integer' },
    ],
    rows: averagesFrom(options.rows).map((entry) => ({
      measure: entry.label,
      average: entry.average,
      total: entry.total,
      samples: entry.samples,
    })),
    note: options.note,
  };
}
