import type { StatSection } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, ratio, type ReportContext } from './context';
import { averagesTable, mixTable, propertyMix } from './dimensions';

const TASK_KEYS = [
  'task_type',
  'repeat_mode',
  'focus_connected',
  'buddy',
  'has_schedule',
  'has_reminder',
  'streak_tier',
  'tag_count',
  'focus_tag_count',
  'checklist_count',
  'streak_length',
  'count',
];

const CALENDAR_STAGES: Record<string, string> = {
  calendar_connect_viewed: 'Opened the connect sheet',
  calendar_connected: 'Connected',
  calendar_disconnected: 'Disconnected',
  calendar_sync_failed: 'Sync failed',
};

const TIMER_KEYS = [
  'phase',
  'auto_start_breaks',
  'focus_duration_minutes',
  'break_duration_minutes',
  'duration_minutes',
  'completed_seconds',
];

export async function buildTasks(context: ReportContext): Promise<StatSection> {
  const [createdMix, completedMix, timerStartMix, timerDoneMix, calendarRows] = await Promise.all([
    propertyMix({ occurredAt: context.window, name: 'task_created' }, TASK_KEYS),
    propertyMix({ occurredAt: context.window, name: 'task_completed' }, TASK_KEYS),
    propertyMix({ occurredAt: context.window, name: 'timer_started' }, TIMER_KEYS),
    propertyMix({ occurredAt: context.window, name: 'timer_completed' }, TIMER_KEYS),
    groupByProperties(
      { occurredAt: context.window, name: { $in: Object.keys(CALENDAR_STAGES) } },
      { stage: '$name', source: 'source', provider: 'provider', direction: 'direction' },
    ),
  ]);

  const created = context.metric('task_created');
  const completed = context.metric('task_completed');
  const reopened = context.metric('task_reopened');
  const deleted = context.metric('task_deleted');
  const timerStarted = context.metric('timer_started');
  const timerCompleted = context.metric('timer_completed');
  const timerCancelled = context.metric('timer_cancelled');

  const focusMinutes = timerDoneMix
    .filter((row) => row._id.key === 'completed_seconds' && typeof row._id.value === 'number')
    .reduce((sum, row) => sum + (Number(row._id.value) * row.count) / 60, 0);

  return {
    id: 'tasks',
    title: 'Tasks & planner',
    question: 'Do people actually plan work and finish it?',
    blurb: 'The core loop: what gets written down, what gets done, what gets focused on.',
    kpis: [
      kpi('tasks_created', created.events, { sparkline: context.seriesFor('task_created') }),
      kpi('tasks_completed', completed.events, {
        sparkline: context.seriesFor('task_completed'),
        detail: `${completed.users} users`,
      }),
      kpi('task_completion_rate', rate(completed.events, created.events), {
        sample: created.events,
      }),
      kpi('task_creators', created.users, {
        detail: `${rate(created.users, context.activeUsers)}% of active users`,
      }),
      kpi('tasks_per_active_user', ratio(completed.events, context.activeUsers)),
      kpi('task_reopen_rate', rate(reopened.events, completed.events), {
        detail: `${reopened.events} reopened, ${deleted.events} deleted`,
        sample: completed.events,
      }),
      kpi('focus_started', timerStarted.events, { sparkline: context.seriesFor('timer_started') }),
      kpi('focus_completion_rate', rate(timerCompleted.events, timerStarted.events), {
        detail: `${timerCancelled.events} cancelled early`,
        sample: timerStarted.events,
      }),
      kpi('focus_users', timerStarted.users, {
        detail: `${Math.round(focusMinutes).toLocaleString()} minutes focused`,
      }),
    ],
    series: [
      {
        key: 'tasks.daily',
        title: 'Planned versus done',
        question: 'Are people finishing what they write down, day by day?',
        lines: [
          { key: 'created', label: 'Created', format: 'integer' },
          { key: 'completed', label: 'Completed', format: 'integer' },
          { key: 'focus', label: 'Focus sessions', format: 'integer' },
        ],
        points: context.dates.map((date, index) => ({
          date,
          created: context.seriesFor('task_created')[index] ?? 0,
          completed: context.seriesFor('task_completed')[index] ?? 0,
          focus: context.seriesFor('timer_started')[index] ?? 0,
        })),
      },
    ],
    tables: [
      mixTable({
        key: 'tasks.completed_mix',
        title: 'What a completed task looks like',
        question: 'Which task shapes actually get finished — and which features ride along?',
        rows: completedMix,
        total: completed.events,
        countLabel: 'Completions',
        order: [
          'task_type',
          'repeat_mode',
          'focus_connected',
          'buddy',
          'has_schedule',
          'has_reminder',
          'streak_tier',
        ],
        note: 'Compare each share against the same dimension in "What gets created" to see which shapes get abandoned.',
      }),
      mixTable({
        key: 'tasks.created_mix',
        title: 'What gets created',
        question: 'Which planner features do people reach for when writing a task?',
        rows: createdMix,
        total: created.events,
        countLabel: 'Created',
        order: [
          'task_type',
          'repeat_mode',
          'focus_connected',
          'buddy',
          'has_schedule',
          'has_reminder',
        ],
      }),
      averagesTable({
        key: 'tasks.averages',
        title: 'Task detail averages',
        question: 'How much structure does a typical task carry?',
        rows: completedMix,
        note: 'Weighted by completions, so it reflects tasks that mattered rather than tasks that were typed.',
      }),
      mixTable({
        key: 'tasks.timer_mix',
        title: 'Focus timer settings',
        question: 'Are the default focus and break lengths the ones people actually use?',
        rows: timerStartMix,
        total: timerStarted.events,
        countLabel: 'Sessions',
        order: ['phase', 'focus_duration_minutes', 'break_duration_minutes', 'auto_start_breaks'],
      }),
      averagesTable({
        key: 'tasks.timer_averages',
        title: 'Focus session length',
        question: 'How long is a session that actually runs to the end?',
        rows: timerDoneMix,
      }),
      {
        key: 'tasks.calendar_sync',
        title: 'Calendar sync',
        question: 'Do people who open the calendar sheet connect, and do connections last?',
        columns: [
          { key: 'stage', label: 'Stage' },
          { key: 'source', label: 'Opened from' },
          { key: 'provider', label: 'Provider' },
          { key: 'direction', label: 'Direction' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: calendarRows
          .map((row) => ({
            stage: CALENDAR_STAGES[String(row._id.stage)] ?? String(row._id.stage),
            order: Object.keys(CALENDAR_STAGES).indexOf(String(row._id.stage)),
            source: String(row._id.source),
            provider: String(row._id.provider),
            direction: String(row._id.direction),
            events: row.count,
            users: row.users,
          }))
          .sort((a, b) => a.order - b.order || b.events - a.events)
          .map(({ order: _order, ...row }) => row),
        note: 'Sheet opens are tracked from October 2026; "unknown" means that stage does not carry the field.',
      },
    ],
  };
}
