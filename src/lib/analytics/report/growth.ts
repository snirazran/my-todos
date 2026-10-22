import {
  NOT_STATS_EXCLUDED,
  StatsEventModel as AnalyticsEventModel,
} from '@/lib/analytics/statsExclusion';
import UserModel from '@/lib/models/User';
import type { StatSection, StatTable } from '@/lib/analytics/catalog';
import {
  addUtcDays,
  groupByProperties,
  kpi,
  rate,
  ratio,
  startOfUtcDay,
  ymd,
  type ReportContext,
} from './context';

const RETENTION_OFFSETS = [1, 3, 7, 14, 30];
const FIRST_RUN_STEPS = [
  { step: 'hungry', label: 'Asked to feed the frog' },
  { step: 'yum', label: 'Fed the frog' },
  { step: 'streak', label: 'Saw the Day-1 streak' },
  { step: 'quest', label: 'Shown the quest reward' },
  { step: 'claiming', label: 'Claimed the reward' },
  { step: 'finale', label: 'App unlocked' },
];
const COHORT_LIMIT = 50_000;

type CohortUser = { _id: unknown; createdAt: Date };

function weekKey(date: Date) {
  const day = startOfUtcDay(date);
  const offset = (day.getUTCDay() + 6) % 7;
  return ymd(addUtcDays(day, -offset));
}

export async function buildGrowth(context: ReportContext): Promise<StatSection> {
  const { range } = context;
  const today = startOfUtcDay(new Date());

  const cohortUsers = await UserModel.find({ createdAt: context.window, ...NOT_STATS_EXCLUDED })
    .select('_id createdAt')
    .limit(COHORT_LIMIT)
    .lean<CohortUser[]>();
  const cohortIds = cohortUsers.map((user) => String(user._id));

  const [activeDayRows, milestoneRows, platformRows, pageRows, onboardingStepRows, firstRunRows, guestRows] =
    await Promise.all([
      cohortIds.length
        ? AnalyticsEventModel.aggregate<{ _id: string; days: string[] }>([
            {
              $match: {
                userId: { $in: cohortIds },
                name: 'app_opened',
                occurredAt: { $gte: range.start },
              },
            },
            {
              $group: {
                _id: '$userId',
                days: {
                  $addToSet: {
                    $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' },
                  },
                },
              },
            },
          ])
        : Promise.resolve([]),
      cohortIds.length
        ? AnalyticsEventModel.aggregate<{ _id: string; users: string[] }>([
            {
              $match: {
                userId: { $in: cohortIds },
                name: {
                  $in: [
                    'onboarding_completed',
                    'starter_plan_accepted',
                    'task_created',
                    'task_completed',
                    'timer_started',
                    'quest_objective_claimed',
                  ],
                },
                occurredAt: { $gte: range.start },
              },
            },
            { $group: { _id: '$name', users: { $addToSet: '$userId' } } },
          ])
        : Promise.resolve([]),
      AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
        { $match: { occurredAt: context.window } },
        { $group: { _id: '$platform', users: { $addToSet: '$userId' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
        { $match: { occurredAt: context.window, name: 'page_viewed' } },
        {
          $group: {
            _id: { $ifNull: ['$properties.page', 'unknown'] },
            users: { $addToSet: '$userId' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      AnalyticsEventModel.aggregate<{ _id: { step: string; index: number }; people: string[] }>([
        { $match: { occurredAt: context.window, name: 'onboarding_step_viewed' } },
        {
          $group: {
            _id: {
              step: { $ifNull: ['$properties.step', 'unknown'] },
              index: { $ifNull: ['$properties.step_index', -1] },
            },
            people: { $addToSet: { $ifNull: ['$anonymousId', '$userId'] } },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<{ _id: string; users: string[] }>([
        { $match: { occurredAt: context.window, name: 'first_run_step' } },
        { $group: { _id: { $ifNull: ['$properties.step', 'unknown'] }, users: { $addToSet: '$userId' } } },
      ]),
      groupByProperties(
        {
          occurredAt: context.window,
          $or: [
            { name: 'account_created', 'properties.method': 'guest' },
            { name: 'guest_account_linked' },
          ],
        },
        { event: '$name', provider: 'provider' },
      ),
    ]);

  const activeDays = new Map(activeDayRows.map((row) => [row._id, new Set(row.days)]));
  const milestones = new Map(milestoneRows.map((row) => [row._id, new Set(row.users)]));

  const retentionFor = (users: CohortUser[], offset: number) => {
    let eligible = 0;
    let retained = 0;
    for (const user of users) {
      const signup = startOfUtcDay(new Date(user.createdAt));
      const target = addUtcDays(signup, offset);
      if (target > today) continue;
      eligible += 1;
      if (activeDays.get(String(user._id))?.has(ymd(target))) retained += 1;
    }
    return { eligible, retained, rate: rate(retained, eligible) };
  };

  const overall = Object.fromEntries(
    RETENTION_OFFSETS.map((offset) => [offset, retentionFor(cohortUsers, offset)]),
  );

  const groupByWeek = range.days > 21;
  const cohortGroups = new Map<string, CohortUser[]>();
  for (const user of cohortUsers) {
    const created = new Date(user.createdAt);
    const key = groupByWeek ? weekKey(created) : ymd(startOfUtcDay(created));
    const bucket = cohortGroups.get(key) ?? [];
    bucket.push(user);
    cohortGroups.set(key, bucket);
  }

  const retentionTable: StatTable = {
    key: 'growth.retention_cohorts',
    title: groupByWeek ? 'Retention by signup week' : 'Retention by signup day',
    question: 'Is each new group of users sticking around longer than the last one?',
    columns: [
      { key: 'cohort', label: groupByWeek ? 'Week of' : 'Day' },
      { key: 'size', label: 'Signups', format: 'integer' },
      ...RETENTION_OFFSETS.map((offset) => ({
        key: `d${offset}`,
        label: `D${offset}`,
        format: 'percent' as const,
        hint: `Share back on day ${offset}. Blank when the cohort is not old enough yet.`,
      })),
    ],
    rows: Array.from(cohortGroups, ([cohort, users]) => {
      const row: Record<string, string | number | null> = { cohort, size: users.length };
      for (const offset of RETENTION_OFFSETS) {
        const result = retentionFor(users, offset);
        row[`d${offset}`] = result.eligible ? result.rate : null;
      }
      return row;
    }).sort((a, b) => String(b.cohort).localeCompare(String(a.cohort))),
    note: 'A cell stays blank until every user in that cohort has had the chance to reach the day.',
  };

  const reached = (name: string) => milestones.get(name)?.size ?? 0;
  const returnedNextDay = cohortUsers.filter((user) => {
    const signup = startOfUtcDay(new Date(user.createdAt));
    return activeDays.get(String(user._id))?.has(ymd(addUtcDays(signup, 1)));
  }).length;

  const funnelSteps = [
    { label: 'Created an account', users: cohortUsers.length },
    { label: 'Finished onboarding', users: reached('onboarding_completed') },
    { label: 'Created a task', users: reached('task_created') },
    { label: 'Completed a task', users: reached('task_completed') },
    { label: 'Claimed a quest objective', users: reached('quest_objective_claimed') },
    { label: 'Started a focus timer', users: reached('timer_started') },
    { label: 'Came back the next day', users: returnedNextDay },
  ];

  const activationTable: StatTable = {
    key: 'growth.activation_funnel',
    title: 'First-run funnel',
    question: 'Where do brand-new users fall out before the habit forms?',
    columns: [
      { key: 'step', label: 'Step' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'of_signups', label: '% of signups', format: 'percent' },
      { key: 'step_conversion', label: 'Step-to-step', format: 'percent' },
    ],
    rows: funnelSteps.map((step, index) => ({
      step: step.label,
      users: step.users,
      of_signups: rate(step.users, cohortUsers.length),
      step_conversion: index === 0 ? 100 : rate(step.users, funnelSteps[index - 1].users),
    })),
    note: 'Counts only accounts created inside the selected range, so it reads as a true cohort.',
  };

  const onboardingSteps = onboardingStepRows
    .map((row) => ({ step: row._id.step, index: row._id.index, people: row.people.length }))
    .sort((a, b) => a.index - b.index);
  const onboardingTable: StatTable = {
    key: 'growth.onboarding_steps',
    title: 'Onboarding steps',
    question: 'Which onboarding screen do people quit on, before an account even exists?',
    columns: [
      { key: 'step', label: 'Step' },
      { key: 'people', label: 'People', format: 'integer' },
      { key: 'of_first', label: '% of first step', format: 'percent' },
      { key: 'step_conversion', label: 'Step-to-step', format: 'percent' },
    ],
    rows: onboardingSteps.map((row, index) => ({
      step: row.step,
      people: row.people,
      of_first: rate(row.people, onboardingSteps[0]?.people ?? 0),
      step_conversion: index === 0 ? 100 : rate(row.people, onboardingSteps[index - 1].people),
    })),
    note: 'People are counted by device, since the account is only created on the last step. Counting started October 2026.',
  };

  const firstRunUsers = new Map(firstRunRows.map((row) => [row._id, row.users.length]));
  const firstRunStart = firstRunUsers.get(FIRST_RUN_STEPS[0].step) ?? 0;
  const firstRunTable: StatTable = {
    key: 'growth.first_run_guide',
    title: 'Guided first run',
    question: 'Does the guided first session (feed → streak → claim) get people to the unlocked app?',
    columns: [
      { key: 'step', label: 'Step' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'of_start', label: '% of start', format: 'percent' },
    ],
    rows: FIRST_RUN_STEPS.map(({ step, label }) => ({
      step: label,
      users: firstRunUsers.get(step) ?? 0,
      of_start: rate(firstRunUsers.get(step) ?? 0, firstRunStart),
    })),
    note: 'The streak step only shows when the Day-1 streak popup opens, so it can sit below the steps after it. Counting started October 2026.',
  };

  const guestsCreated = guestRows.find((row) => row._id.event === 'account_created')?.users ?? 0;
  const linkRows = guestRows.filter((row) => row._id.event === 'guest_account_linked');
  const linkedTotal = linkRows.reduce((sum, row) => sum + row.users, 0);
  const guestTable: StatTable = {
    key: 'growth.guest_accounts',
    title: 'Guest accounts saved',
    question: 'Do guests save their frog to a real account, and with which sign-in?',
    columns: [
      { key: 'row', label: '' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'of_guests', label: '% of new guests', format: 'percent' },
    ],
    rows: [
      { row: 'New guest accounts', users: guestsCreated, of_guests: guestsCreated ? 100 : 0 },
      { row: 'Saved to an account', users: linkedTotal, of_guests: rate(linkedTotal, guestsCreated) },
      ...linkRows
        .sort((a, b) => b.users - a.users)
        .map((row) => ({
          row: `  with ${String(row._id.provider)}`,
          users: row.users,
          of_guests: rate(row.users, guestsCreated),
        })),
    ],
    note: 'Saves inside the range can come from guests created before it, so the share can run above what a strict cohort would show. Counting started October 2026.',
  };

  const activationRate = rate(reached('task_completed'), cohortUsers.length);

  return {
    id: 'growth',
    title: 'Growth',
    question: 'Are new people arriving, and do they come back?',
    blurb: 'Signups, activation, retention curves, platforms, and screens.',
    kpis: [
      kpi('new_users', context.newUsers, {
        sparkline: context.dates.map((date) => context.dailyNewUsers.get(date) ?? 0),
      }),
      kpi('active_users', context.activeUsers, {
        sparkline: context.dates.map((date) => context.dailyActiveUsers.get(date) ?? 0),
      }),
      kpi('stickiness', rate(context.dau, context.mau), {
        detail: `${context.dau} avg DAU / ${context.mau} MAU`,
        sample: context.mau,
      }),
      kpi('activation_rate', activationRate, {
        detail: `${reached('task_completed')} of ${cohortUsers.length} new accounts`,
        sample: cohortUsers.length,
      }),
      kpi('retention_d1', overall[1].eligible ? overall[1].rate : null, {
        detail: `${overall[1].retained} of ${overall[1].eligible} eligible`,
        sample: overall[1].eligible,
      }),
      kpi('retention_d7', overall[7].eligible ? overall[7].rate : null, {
        detail: `${overall[7].retained} of ${overall[7].eligible} eligible`,
        sample: overall[7].eligible,
      }),
      kpi('retention_d30', overall[30].eligible ? overall[30].rate : null, {
        detail: `${overall[30].retained} of ${overall[30].eligible} eligible`,
        sample: overall[30].eligible,
      }),
      kpi('sessions_per_active_user', ratio(context.events('app_opened'), context.activeUsers)),
    ],
    series: [
      {
        key: 'growth.daily',
        title: 'Users per day',
        question: 'Is the active base growing, flat, or shrinking?',
        lines: [
          { key: 'active', label: 'Active users', format: 'integer' },
          { key: 'new', label: 'New accounts', format: 'integer' },
          { key: 'sessions', label: 'Sessions', format: 'integer' },
        ],
        points: context.dates.map((date) => ({
          date,
          active: context.dailyActiveUsers.get(date) ?? 0,
          new: context.dailyNewUsers.get(date) ?? 0,
          sessions: context.dailySessions.get(date) ?? 0,
        })),
      },
    ],
    tables: [
      onboardingTable,
      activationTable,
      firstRunTable,
      guestTable,
      retentionTable,
      {
        key: 'growth.platforms',
        title: 'Platforms',
        question: 'Where should the next engineering week go — web, iOS, or Android?',
        columns: [
          { key: 'platform', label: 'Platform' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'events_per_user', label: 'Events / user', format: 'decimal' },
        ],
        rows: platformRows.map((row) => ({
          platform: row._id || 'unknown',
          users: row.users.length,
          events: row.count,
          events_per_user: ratio(row.count, row.users.length),
        })),
      },
      {
        key: 'growth.pages',
        title: 'Screens',
        question: 'Which screens carry the traffic, and which are dead ends?',
        columns: [
          { key: 'page', label: 'Screen' },
          { key: 'views', label: 'Views', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'views_per_user', label: 'Views / user', format: 'decimal' },
        ],
        rows: pageRows.map((row) => ({
          page: row._id,
          views: row.count,
          users: row.users.length,
          views_per_user: ratio(row.count, row.users.length),
        })),
      },
    ],
  };
}
