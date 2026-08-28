import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import { ANALYTICS_EVENTS, analyticsCategory } from '@/lib/analytics/events';
import { EVENT_EMIT_SITES, WIRED_EVENTS } from '@/lib/generated/analyticsManifest';
import type { StatSection } from '@/lib/analytics/catalog';
import { kpi, rate, type ReportContext } from './context';

type LifetimeRow = { _id: string; total: number; firstAt: Date; lastAt: Date };

/**
 * `unwired` is the only status that is always a defect: the name is declared but
 * nothing in the codebase writes it. `waiting` is a wired event that simply has
 * not happened yet, which is normal right after launch and must not read as a
 * fault. `silent` is the one that usually means a regression — it used to fire.
 */
export type TrackingStatus = 'healthy' | 'silent' | 'waiting' | 'unwired';

export type TrackingRow = {
  event: string;
  category: string;
  events: number;
  users: number;
  lifetime: number;
  last_seen: string | null;
  status: TrackingStatus;
  emitted_from: string;
};

export async function buildTracking(context: ReportContext): Promise<StatSection> {
  const lifetimeRows = await AnalyticsEventModel.aggregate<LifetimeRow>([
    {
      $group: {
        _id: '$name',
        total: { $sum: 1 },
        firstAt: { $min: '$occurredAt' },
        lastAt: { $max: '$occurredAt' },
      },
    },
  ]);
  const lifetime = new Map(lifetimeRows.map((row) => [row._id, row]));

  const rows: TrackingRow[] = ANALYTICS_EVENTS.map((event) => {
    const inRange = context.metric(event);
    const allTime = lifetime.get(event);
    const wired = WIRED_EVENTS.has(event);
    const status: TrackingStatus = !wired
      ? 'unwired'
      : inRange.events > 0
        ? 'healthy'
        : allTime && allTime.total > 0
          ? 'silent'
          : 'waiting';
    return {
      event,
      category: analyticsCategory(event),
      events: inRange.events,
      users: inRange.users,
      lifetime: allTime?.total ?? 0,
      last_seen: allTime?.lastAt ? new Date(allTime.lastAt).toISOString().slice(0, 10) : null,
      status,
      emitted_from: EVENT_EMIT_SITES[event] ?? '—',
    };
  });

  const live = rows.filter((row) => row.status === 'healthy').length;
  const silent = rows.filter((row) => row.status === 'silent').length;
  const unwired = rows.filter((row) => row.status === 'unwired').length;
  const waiting = rows.filter((row) => row.status === 'waiting').length;

  const byCategory = new Map<string, TrackingRow[]>();
  for (const row of rows) {
    const bucket = byCategory.get(row.category) ?? [];
    bucket.push(row);
    byCategory.set(row.category, bucket);
  }

  return {
    id: 'tracking',
    title: 'Tracking health',
    question: 'Is every system still reporting?',
    blurb: 'Which events are flowing, which went quiet, and which were never wired.',
    kpis: [
      kpi('events_recorded', context.eventsInRange),
      kpi('events_live', live, { detail: `of ${rows.length} declared event types` }),
      kpi('events_silent', silent, {
        detail: `${waiting} wired but not seen yet · ${unwired} with no emit site`,
      }),
    ],
    series: [
      {
        key: 'tracking.volume',
        title: 'Events recorded per day',
        question: 'Did a deploy break instrumentation, or did people really go quiet?',
        lines: [{ key: 'events', label: 'Events', format: 'integer' }],
        points: context.dates.map((date) => ({
          date,
          events: Array.from(context.dailyEvents.values()).reduce(
            (sum, bucket) => sum + (bucket.get(date) ?? 0),
            0,
          ),
        })),
      },
    ],
    tables: [
      {
        key: 'tracking.coverage_by_category',
        title: 'Coverage by area',
        question: 'Which part of the app is under-instrumented?',
        columns: [
          { key: 'category', label: 'Area' },
          { key: 'declared', label: 'Declared', format: 'integer' },
          { key: 'reporting', label: 'Reporting', format: 'integer' },
          { key: 'coverage', label: 'Coverage', format: 'percent' },
          { key: 'events', label: 'Events in range', format: 'integer' },
        ],
        rows: Array.from(byCategory, ([category, bucket]) => ({
          category,
          declared: bucket.length,
          reporting: bucket.filter((row) => row.status === 'healthy').length,
          coverage: rate(bucket.filter((row) => row.status === 'healthy').length, bucket.length),
          events: bucket.reduce((sum, row) => sum + row.events, 0),
        })).sort((a, b) => a.coverage - b.coverage),
      },
      {
        key: 'tracking.events',
        title: 'Every tracked event',
        question: 'What is each event worth, and when did it last fire?',
        columns: [
          { key: 'event', label: 'Event' },
          { key: 'category', label: 'Area' },
          { key: 'status', label: 'Status' },
          { key: 'events', label: 'In range', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'lifetime', label: 'All time', format: 'integer' },
          { key: 'last_seen', label: 'Last seen' },
          { key: 'emitted_from', label: 'Emitted from' },
        ],
        rows: rows
          .map((row) => ({ ...row }))
          .sort((a, b) => {
            const order: Record<TrackingStatus, number> = {
              unwired: 0,
              silent: 1,
              waiting: 2,
              healthy: 3,
            };
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return b.events - a.events;
          }),
        note: 'unwired = declared but nothing in the codebase writes it (always a defect). silent = it fired before and wrote nothing in this range, which usually means a regression. waiting = wired and simply has not happened yet, which is normal soon after launch.',
      },
    ],
  };
}
