import type { PipelineStage } from 'mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import UserModel from '@/lib/models/User';
import type { StatKpi } from '@/lib/analytics/catalog';

export const ANONYMOUS_PREFIX = 'anonymous:';

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function rate(numerator: number, denominator: number, digits = 1) {
  if (!denominator) return 0;
  return round((numerator / denominator) * 100, digits);
}

export function ratio(numerator: number, denominator: number, digits = 2) {
  if (!denominator) return 0;
  return round(numerator / denominator, digits);
}

export type EventTotal = { events: number; users: number; lastAt: Date | null };

export type DateRange = {
  start: Date;
  endDay: Date;
  endExclusive: Date;
  days: number;
};

export function resolveRange(params: {
  start?: string | null;
  end?: string | null;
  days?: number | null;
}): DateRange {
  const today = startOfUtcDay(new Date());
  const parse = (value?: string | null) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? startOfUtcDay(new Date(`${value}T00:00:00.000Z`))
      : null;

  const requestedDays = Number(params.days ?? 30);
  const fallbackDays = [7, 14, 30, 90, 180, 365].includes(requestedDays) ? requestedDays : 30;
  const endDay = parse(params.end) ?? today;
  const candidateStart = parse(params.start) ?? addUtcDays(endDay, -(fallbackDays - 1));
  const spanDays = Math.floor((endDay.getTime() - candidateStart.getTime()) / 86_400_000) + 1;
  const valid = spanDays >= 1 && spanDays <= 400;

  const start = valid ? candidateStart : addUtcDays(endDay, -(fallbackDays - 1));
  const days = valid ? spanDays : fallbackDays;
  return { start, endDay, endExclusive: addUtcDays(endDay, 1), days };
}

export function previousRange(range: DateRange): DateRange {
  const endDay = addUtcDays(range.start, -1);
  const start = addUtcDays(endDay, -(range.days - 1));
  return { start, endDay, endExclusive: addUtcDays(endDay, 1), days: range.days };
}

export type ReportContext = {
  range: DateRange;
  window: { $gte: Date; $lt: Date };
  dates: string[];
  totals: Map<string, EventTotal>;
  dailyEvents: Map<string, Map<string, number>>;
  dailyActiveUsers: Map<string, number>;
  dailySessions: Map<string, number>;
  dailyNewUsers: Map<string, number>;
  activeUsers: number;
  newUsers: number;
  totalUsers: number;
  premiumUsers: number;
  dau: number;
  wau: number;
  mau: number;
  eventsInRange: number;
  firstEventAt: Date | null;
  metric: (name: string) => EventTotal;
  events: (name: string) => number;
  users: (name: string) => number;
  seriesFor: (name: string) => number[];
};

type DayEventRow = { _id: { date: string; name: string }; count: number };
type DayUserRow = { _id: string; users: number; sessions: number };
type TotalRow = { _id: string; count: number; users: string[]; lastAt: Date };

export async function buildContext(range: DateRange): Promise<ReportContext> {
  const window = { $gte: range.start, $lt: range.endExclusive };
  const notAnonymous = { userId: { $not: new RegExp(`^${ANONYMOUS_PREFIX}`) } };
  const rollingStart = addUtcDays(range.endDay, -29);

  const [
    totalRows,
    dayEventRows,
    dayUserRows,
    newUserRows,
    counts,
    firstEvent,
    rollingRows,
    activeRows,
  ] = await Promise.all([
      AnalyticsEventModel.aggregate<TotalRow>([
        { $match: { occurredAt: window } },
        {
          $group: {
            _id: '$name',
            count: { $sum: 1 },
            users: { $addToSet: '$userId' },
            lastAt: { $max: '$occurredAt' },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<DayEventRow>([
        { $match: { occurredAt: window } },
        {
          $group: {
            _id: {
              date: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
              name: '$name',
            },
            count: { $sum: 1 },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<DayUserRow>([
        { $match: { occurredAt: window, ...notAnonymous } },
        {
          $group: {
            _id: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
            userSet: { $addToSet: '$userId' },
            sessionSet: {
              $addToSet: { $cond: [{ $eq: ['$name', 'app_opened'] }, '$sessionId', '$$REMOVE'] },
            },
          },
        },
        { $project: { users: { $size: '$userSet' }, sessions: { $size: '$sessionSet' } } },
      ]),
      UserModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: window } },
        {
          $group: {
            _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'UTC' } },
            count: { $sum: 1 },
          },
        },
      ]),
      Promise.all([
        UserModel.countDocuments({}),
        UserModel.countDocuments({ premiumUntil: { $gt: new Date() } }),
      ]),
      AnalyticsEventModel.findOne({}).sort({ occurredAt: 1 }).select('occurredAt').lean<{
        occurredAt: Date;
      } | null>(),
      AnalyticsEventModel.aggregate<{ _id: string; users: string[] }>([
        { $match: { occurredAt: { $gte: rollingStart, $lt: range.endExclusive }, ...notAnonymous } },
        {
          $group: {
            _id: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
            users: { $addToSet: '$userId' },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<{ count: number }>([
        { $match: { occurredAt: window, ...notAnonymous } },
        { $group: { _id: null, users: { $addToSet: '$userId' } } },
        { $project: { count: { $size: '$users' } } },
      ]),
    ]);

  const totals = new Map<string, EventTotal>(
    totalRows.map((row) => [
      row._id,
      {
        events: row.count,
        users: row.users.filter((id) => !id.startsWith(ANONYMOUS_PREFIX)).length,
        lastAt: row.lastAt ?? null,
      },
    ]),
  );

  const dates: string[] = [];
  for (let index = 0; index < range.days; index += 1) {
    dates.push(ymd(addUtcDays(range.start, index)));
  }

  const dailyEvents = new Map<string, Map<string, number>>();
  for (const row of dayEventRows) {
    const bucket = dailyEvents.get(row._id.name) ?? new Map<string, number>();
    bucket.set(row._id.date, row.count);
    dailyEvents.set(row._id.name, bucket);
  }

  const dailyActiveUsers = new Map(dayUserRows.map((row) => [row._id, row.users]));
  const dailySessions = new Map(dayUserRows.map((row) => [row._id, row.sessions]));
  const dailyNewUsers = new Map(newUserRows.map((row) => [row._id, row.count]));

  const activeSince = (from: Date) => {
    const ids = new Set<string>();
    const fromKey = ymd(from);
    for (const row of rollingRows) {
      if (row._id >= fromKey) row.users.forEach((id) => ids.add(id));
    }
    return ids.size;
  };

  const activeUsers = activeRows[0]?.count ?? 0;

  const metric = (name: string): EventTotal =>
    totals.get(name) ?? { events: 0, users: 0, lastAt: null };

  return {
    range,
    window,
    dates,
    totals,
    dailyEvents,
    dailyActiveUsers,
    dailySessions,
    dailyNewUsers,
    activeUsers,
    newUsers: Array.from(dailyNewUsers.values()).reduce((sum, value) => sum + value, 0),
    totalUsers: counts[0],
    premiumUsers: counts[1],
    dau: dailyActiveUsers.get(ymd(range.endDay)) ?? 0,
    wau: activeSince(addUtcDays(range.endDay, -6)),
    mau: activeSince(rollingStart),
    eventsInRange: totalRows.reduce((sum, row) => sum + row.count, 0),
    firstEventAt: firstEvent?.occurredAt ?? null,
    metric,
    events: (name) => metric(name).events,
    users: (name) => metric(name).users,
    seriesFor: (name) => {
      const bucket = dailyEvents.get(name);
      return dates.map((date) => bucket?.get(date) ?? 0);
    },
  };
}

export function kpi(
  metricKey: string,
  value: number | null,
  options: {
    previous?: number | null;
    sparkline?: number[];
    detail?: string;
    sample?: number;
  } = {},
): StatKpi {
  return {
    metric: metricKey,
    value,
    previous: options.previous ?? null,
    sparkline: options.sparkline,
    detail: options.detail,
    sample: options.sample,
  };
}

export type PropertyRow = {
  _id: Record<string, string | number | boolean>;
  count: number;
  users: number;
};

export async function groupByProperties(
  match: PipelineStage.Match['$match'],
  keys: Record<string, string>,
  options: { sums?: Record<string, string>; limit?: number } = {},
) {
  const group: Record<string, unknown> = {
    _id: Object.fromEntries(
      Object.entries(keys).map(([alias, path]) => [
        alias,
        path.startsWith('$')
          ? { $ifNull: [path, 'unknown'] }
          : { $ifNull: [`$properties.${path}`, 'unknown'] },
      ]),
    ),
    count: { $sum: 1 },
    userSet: { $addToSet: '$userId' },
  };
  for (const [alias, path] of Object.entries(options.sums ?? {})) {
    group[alias] = { $sum: { $ifNull: [`$properties.${path}`, 0] } };
  }

  const projection: Record<string, unknown> = {
    _id: 1,
    count: 1,
    users: { $size: '$userSet' },
  };
  for (const alias of Object.keys(options.sums ?? {})) projection[alias] = 1;

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $group: group as PipelineStage.Group['$group'] },
    { $project: projection },
    { $sort: { count: -1 } },
  ];
  if (options.limit) pipeline.push({ $limit: options.limit });

  return AnalyticsEventModel.aggregate<PropertyRow & Record<string, number>>(pipeline);
}
