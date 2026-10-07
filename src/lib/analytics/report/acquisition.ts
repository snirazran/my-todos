import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import AdSpendImportModel from '@/lib/models/AdSpendImport';
import UserModel from '@/lib/models/User';
import type {
  AcquisitionMetrics,
  AcquisitionNode,
  AcquisitionReport,
  StatColumn,
  StatRow,
  StatSection,
  StatTable,
} from '@/lib/analytics/catalog';
import {
  CHANNEL_LABELS,
  PAID_CHANNELS,
  normalizeKey,
  type AcquisitionChannel,
  type UserAcquisition,
} from '@/lib/attribution/classify';
import { loadSpend, type SpendRow } from '@/lib/attribution/spend';
import type { SpendLevel } from '@/lib/attribution/spendImport';
import { addUtcDays, kpi, round, startOfUtcDay, ymd, type ReportContext } from './context';

const COHORT_LIMIT = 50_000;
const PEOPLE_LIMIT = 1000;
const NOT_SET = '(not set)';

const PSEUDO_CHANNELS: Record<string, string> = {
  awaiting_match: 'Awaiting ad match',
  unprocessed: 'Not processed yet',
};

export const LEVEL_NAMES: Record<string, string[]> = {
  apple_ads: ['Campaign', 'Ad group', 'Keyword'],
  google_ads: ['Campaign', 'Ad group', 'Keyword'],
  meta_ads: ['Campaign', 'Ad set', 'Ad'],
  tiktok_ads: ['Campaign', 'Ad group', 'Ad'],
  other_paid: ['Source', 'Campaign', 'Content'],
  campaign_link: ['Source', 'Campaign', 'Content'],
  referral: ['Link type'],
  ai_assistant: ['Site', 'Campaign'],
  social: ['Site', 'Campaign'],
  search: ['Search engine'],
  web_referral: ['Site', 'Landing page'],
  direct: ['Landing page'],
};

const SPEND_LEVELS: SpendLevel[] = ['campaign', 'adGroup', 'keyword'];

type CohortUser = {
  _id: unknown;
  createdAt: Date;
  isGuest?: boolean;
  acquisition?: UserAcquisition;
};

type UserOutcome = {
  onboarded: boolean;
  activated: boolean;
  activeDays: Set<string>;
  tasksFirstWeek: number;
  trials: number;
  paid: number;
  revenue: number;
  platform?: string;
  lastSeen?: string;
};

type Segment = { key: string; label: string };

function emptyMetrics(): AcquisitionMetrics {
  return {
    accounts: 0,
    onboarded: 0,
    activated: 0,
    d1Retained: 0,
    d1Eligible: 0,
    d7Retained: 0,
    d7Eligible: 0,
    tasksFirstWeek: 0,
    trials: 0,
    paid: 0,
    revenue: 0,
    spend: 0,
    installs: 0,
    taps: 0,
    impressions: 0,
    spendEstimated: false,
  };
}

export function channelKeyFor(acquisition: UserAcquisition | undefined) {
  if (!acquisition) return 'unprocessed';
  if (acquisition.status === 'pending' && !acquisition.paid) return 'awaiting_match';
  return acquisition.channel;
}

export function channelLabel(key: string) {
  return CHANNEL_LABELS[key as AcquisitionChannel] ?? PSEUDO_CHANNELS[key] ?? key;
}

function segment(label: string | undefined, fallback = NOT_SET): Segment {
  const text = label?.trim() || fallback;
  return { key: normalizeKey(text) || fallback, label: text };
}

export function pathFor(acquisition: UserAcquisition | undefined): Segment[] {
  const channel = channelKeyFor(acquisition);
  const root = { key: channel, label: channelLabel(channel) };
  if (!acquisition) return [root];
  switch (channel) {
    case 'apple_ads':
    case 'google_ads':
      return [
        root,
        segment(acquisition.campaign),
        segment(acquisition.adGroup),
        segment(acquisition.keyword, '(no keyword)'),
      ];
    case 'meta_ads':
    case 'tiktok_ads':
      return [
        root,
        segment(acquisition.campaign),
        segment(acquisition.adGroup),
        segment(acquisition.ad ?? acquisition.content ?? acquisition.keyword),
      ];
    case 'other_paid':
    case 'campaign_link':
      return [root, segment(acquisition.network), segment(acquisition.campaign), segment(acquisition.content)];
    case 'referral':
      return [root, segment(acquisition.network)];
    case 'ai_assistant':
    case 'social':
      return [root, segment(acquisition.referrerHost ?? acquisition.network), segment(acquisition.campaign)];
    case 'search':
      return [root, segment(acquisition.referrerHost ?? acquisition.network)];
    case 'web_referral':
      return [root, segment(acquisition.referrerHost ?? acquisition.network), segment(acquisition.touch?.landing)];
    case 'direct':
      return [root, segment(acquisition.touch?.landing)];
    default:
      return [root];
  }
}

function spendPath(row: SpendRow, depth: number): Segment[] {
  const segments: Segment[] = [{ key: row.channel, label: channelLabel(row.channel) }];
  if (depth >= 1) segments.push({ key: row.campaignKey, label: row.campaign });
  if (depth >= 2) segments.push(segment(row.adGroup));
  if (depth >= 3) segments.push(segment(row.keyword, '(no keyword)'));
  return segments;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return null;
  return round((numerator / denominator) * 100, 1);
}

function money(numerator: number, denominator: number) {
  if (!numerator || !denominator) return null;
  return round(numerator / denominator, 2);
}

const METRIC_COLUMNS: StatColumn[] = [
  { key: 'accounts', label: 'Accounts', format: 'integer', hint: 'New accounts created in the range.' },
  { key: 'onboarded', label: 'Onboarded', format: 'percent', hint: 'Share that finished onboarding.' },
  { key: 'activated', label: 'Did a task', format: 'percent', hint: 'Share that completed at least one task.' },
  { key: 'd1', label: 'Back D1', format: 'percent', hint: 'Share that opened the app the day after signup, of those old enough.' },
  { key: 'd7', label: 'Back D7', format: 'percent', hint: 'Share that opened the app on day 7, of those old enough.' },
  { key: 'tasks_week1', label: 'Tasks wk1', format: 'decimal', hint: 'Average tasks completed in the first 7 days.' },
  { key: 'trials', label: 'Trials', format: 'integer' },
  { key: 'paid', label: 'Paid', format: 'integer', hint: 'Users who paid at least once (subscription or pack).' },
  { key: 'revenue', label: 'Revenue', format: 'money', hint: 'Production revenue from these users, to date.' },
];

const COST_COLUMNS: StatColumn[] = [
  { key: 'spend', label: 'Spend', format: 'money' },
  { key: 'installs', label: 'Installs', format: 'decimal', hint: 'Installs reported by the ad network.' },
  { key: 'install_to_account', label: 'Inst→Acct', format: 'percent' },
  { key: 'cost_per_account', label: '$/account', format: 'money' },
  { key: 'cost_per_activated', label: '$/activated', format: 'money' },
  { key: 'roas', label: 'ROAS', format: 'decimal', hint: 'Revenue to date ÷ spend.' },
];

function metricRow(metrics: AcquisitionMetrics, withCost: boolean): StatRow {
  const row: StatRow = {
    accounts: metrics.accounts,
    onboarded: pct(metrics.onboarded, metrics.accounts),
    activated: pct(metrics.activated, metrics.accounts),
    d1: pct(metrics.d1Retained, metrics.d1Eligible),
    d7: pct(metrics.d7Retained, metrics.d7Eligible),
    tasks_week1: metrics.accounts ? round(metrics.tasksFirstWeek / metrics.accounts, 1) : null,
    trials: metrics.trials,
    paid: metrics.paid,
    revenue: round(metrics.revenue, 2),
  };
  if (withCost) {
    row.spend = metrics.spend ? round(metrics.spend, 2) : null;
    row.installs = metrics.installs ? round(metrics.installs, 1) : null;
    row.install_to_account = metrics.installs ? pct(metrics.accounts, metrics.installs) : null;
    row.cost_per_account = money(metrics.spend, metrics.accounts);
    row.cost_per_activated = money(metrics.spend, metrics.activated);
    row.roas = metrics.spend ? round(metrics.revenue / metrics.spend, 2) : null;
  }
  return row;
}

function addMetrics(target: AcquisitionMetrics, user: AcquisitionMetrics) {
  for (const key of Object.keys(user) as Array<keyof AcquisitionMetrics>) {
    if (key === 'spendEstimated') continue;
    (target[key] as number) += user[key] as number;
  }
}

export async function buildAcquisition(
  context: ReportContext,
): Promise<{ section: StatSection; report: AcquisitionReport }> {
  const { range } = context;
  const today = startOfUtcDay(new Date());

  const cohort = await UserModel.find({ createdAt: context.window })
    .select('_id createdAt isGuest acquisition')
    .sort({ createdAt: -1 })
    .limit(COHORT_LIMIT)
    .lean<CohortUser[]>();
  const cohortIds = cohort.map((user) => String(user._id));

  const [eventRows, spendRows, spendImports, referrerRows] = await Promise.all([
    cohortIds.length
      ? AnalyticsEventModel.aggregate<{
          _id: { user: string; name: string; day: string };
          count: number;
          revenue: number;
          trials: number;
          paid: number;
          platform: string;
          last: Date;
        }>([
          {
            $match: {
              userId: { $in: cohortIds },
              occurredAt: { $gte: range.start },
              name: {
                $in: [
                  'app_opened',
                  'page_viewed',
                  'onboarding_completed',
                  'task_completed',
                  'subscription_started',
                  'subscription_renewed',
                  'subscription_refunded',
                  'purchase_completed',
                  'fly_pack_purchase_completed',
                ],
              },
            },
          },
          {
            $project: {
              userId: 1,
              name: 1,
              occurredAt: 1,
              platform: 1,
              finance: {
                $and: [
                  { $eq: ['$source', 'revenuecat'] },
                  { $ne: ['$properties.environment', 'SANDBOX'] },
                ],
              },
              period: '$properties.period_type',
              conversion: '$properties.is_trial_conversion',
              amount: { $ifNull: ['$properties.revenue_usd', { $ifNull: ['$properties.price_usd', 0] }] },
            },
          },
          {
            $group: {
              _id: {
                user: '$userId',
                name: '$name',
                day: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
              },
              count: { $sum: 1 },
              revenue: { $sum: { $cond: ['$finance', '$amount', 0] } },
              trials: {
                $sum: {
                  $cond: [
                    { $and: ['$finance', { $eq: ['$name', 'subscription_started'] }, { $eq: ['$period', 'TRIAL'] }] },
                    1,
                    0,
                  ],
                },
              },
              paid: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        '$finance',
                        {
                          $or: [
                            { $and: [{ $eq: ['$name', 'subscription_started'] }, { $ne: ['$period', 'TRIAL'] }] },
                            { $and: [{ $eq: ['$name', 'subscription_renewed'] }, { $eq: ['$conversion', true] }] },
                            { $in: ['$name', ['purchase_completed', 'fly_pack_purchase_completed']] },
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              platform: { $first: '$platform' },
              last: { $max: '$occurredAt' },
            },
          },
        ])
      : Promise.resolve([]),
    loadSpend(ymd(range.start), ymd(range.endDay)),
    AdSpendImportModel.countDocuments({}),
    AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
      { $match: { occurredAt: context.window, name: 'app_opened' } },
      {
        $group: {
          _id: {
            $let: {
              vars: { host: { $ifNull: ['$properties.referrer_host', ''] } },
              in: { $cond: [{ $eq: ['$$host', ''] }, 'none', '$$host'] },
            },
          },
          users: { $addToSet: '$userId' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
  ]);

  const outcomes = new Map<string, UserOutcome>();
  const createdById = new Map(cohort.map((user) => [String(user._id), startOfUtcDay(new Date(user.createdAt))]));
  for (const row of eventRows) {
    const userId = row._id.user;
    const outcome =
      outcomes.get(userId) ??
      ({
        onboarded: false,
        activated: false,
        activeDays: new Set<string>(),
        tasksFirstWeek: 0,
        trials: 0,
        paid: 0,
        revenue: 0,
      } satisfies UserOutcome);
    const signup = createdById.get(userId);
    if (row._id.name === 'app_opened' || row._id.name === 'page_viewed') {
      outcome.activeDays.add(row._id.day);
      if (row.platform && row.platform !== 'unknown') outcome.platform = row.platform;
    }
    if (row._id.name === 'onboarding_completed') outcome.onboarded = true;
    if (row._id.name === 'task_completed') {
      outcome.activated = true;
      if (signup && row._id.day < ymd(addUtcDays(signup, 7))) outcome.tasksFirstWeek += row.count;
    }
    outcome.trials += row.trials;
    outcome.paid += row.paid;
    outcome.revenue += row.revenue;
    const last = ymd(new Date(row.last));
    if (!outcome.lastSeen || last > outcome.lastSeen) outcome.lastSeen = last;
    outcomes.set(userId, outcome);
  }

  const nodes = new Map<string, AcquisitionNode>();
  const nodeFor = (segments: Segment[], paid: boolean) => {
    const key = segments.map((entry) => entry.key).join('\u0001');
    let node = nodes.get(key);
    if (!node) {
      node = {
        path: segments.map((entry) => entry.key),
        labels: segments.map((entry) => entry.label),
        paid,
        metrics: emptyMetrics(),
      };
      nodes.set(key, node);
    }
    return node;
  };

  const coverage: AcquisitionReport['coverage'] = {
    accounts: cohort.length,
    known: 0,
    direct: 0,
    awaiting: 0,
    unprocessed: 0,
    revenueCatConfigured: !!process.env.REVENUECAT_SECRET_API_KEY,
    spendImports,
    spendInRange: 0,
    spendDepth: {},
  };

  const funnel = {
    onboarded: 0,
    activated: 0,
    d1Retained: 0,
    d1Eligible: 0,
    d7Retained: 0,
    d7Eligible: 0,
    trials: 0,
    paid: 0,
  };

  const people: StatRow[] = [];
  const dailyByChannel = new Map<string, Map<string, number>>();

  for (const user of cohort) {
    const userId = String(user._id);
    const signup = startOfUtcDay(new Date(user.createdAt));
    const outcome = outcomes.get(userId);
    const channel = channelKeyFor(user.acquisition);
    const segments = pathFor(user.acquisition);
    const paidChannel = PAID_CHANNELS.has(channel as AcquisitionChannel);

    if (channel === 'unprocessed') coverage.unprocessed += 1;
    else if (channel === 'awaiting_match') coverage.awaiting += 1;
    else if (channel === 'direct') coverage.direct += 1;
    else coverage.known += 1;

    const d1Day = addUtcDays(signup, 1);
    const d7Day = addUtcDays(signup, 7);
    const d1Eligible = d1Day <= today;
    const d7Eligible = d7Day <= today;
    const d1Retained = d1Eligible && !!outcome?.activeDays.has(ymd(d1Day));
    const d7Retained = d7Eligible && !!outcome?.activeDays.has(ymd(d7Day));

    const metrics = emptyMetrics();
    metrics.accounts = 1;
    metrics.onboarded = outcome?.onboarded ? 1 : 0;
    metrics.activated = outcome?.activated ? 1 : 0;
    metrics.d1Eligible = d1Eligible ? 1 : 0;
    metrics.d1Retained = d1Retained ? 1 : 0;
    metrics.d7Eligible = d7Eligible ? 1 : 0;
    metrics.d7Retained = d7Retained ? 1 : 0;
    metrics.tasksFirstWeek = outcome?.tasksFirstWeek ?? 0;
    metrics.trials = outcome?.trials ? 1 : 0;
    metrics.paid = outcome?.paid ? 1 : 0;
    metrics.revenue = outcome?.revenue ?? 0;

    funnel.onboarded += metrics.onboarded;
    funnel.activated += metrics.activated;
    funnel.d1Eligible += metrics.d1Eligible;
    funnel.d1Retained += metrics.d1Retained;
    funnel.d7Eligible += metrics.d7Eligible;
    funnel.d7Retained += metrics.d7Retained;
    funnel.trials += metrics.trials;
    funnel.paid += metrics.paid;

    for (let depth = 1; depth <= segments.length; depth += 1) {
      addMetrics(nodeFor(segments.slice(0, depth), paidChannel).metrics, metrics);
    }

    const day = ymd(signup);
    const bucket = dailyByChannel.get(channel) ?? new Map<string, number>();
    bucket.set(day, (bucket.get(day) ?? 0) + 1);
    dailyByChannel.set(channel, bucket);

    if (people.length < PEOPLE_LIMIT) {
      people.push({
        user: userId.slice(0, 8),
        user_id: userId,
        path: segments.map((entry) => entry.key).join('\u0001'),
        signed_up: day,
        platform: user.acquisition?.platform ?? outcome?.platform ?? 'unknown',
        channel: channelLabel(channel),
        campaign: segments[1]?.label ?? '',
        ad_group: segments[2]?.label ?? '',
        keyword: segments[3]?.label ?? '',
        guest: user.isGuest ? 'yes' : 'no',
        onboarded: outcome?.onboarded ? 'yes' : 'no',
        tasks_week1: outcome?.tasksFirstWeek ?? 0,
        active_days: outcome?.activeDays.size ?? 0,
        back_d1: d1Eligible ? (d1Retained ? 'yes' : 'no') : 'too early',
        back_d7: d7Eligible ? (d7Retained ? 'yes' : 'no') : 'too early',
        trial: outcome?.trials ? 'yes' : 'no',
        paid: outcome?.paid ? 'yes' : 'no',
        revenue: round(outcome?.revenue ?? 0, 2),
        last_seen: outcome?.lastSeen ?? '',
      });
    }
  }

  const spendDepth = coverage.spendDepth;
  const byChannel = new Map<string, SpendRow[]>();
  for (const row of spendRows) {
    const list = byChannel.get(row.channel) ?? [];
    list.push(row);
    byChannel.set(row.channel, list);
  }
  for (const [channel, rows] of Array.from(byChannel.entries())) {
    const levels = new Set(rows.map((row) => row.level));
    spendDepth[channel] = levels.has('keyword') ? 3 : levels.has('adGroup') ? 2 : 1;
    for (let depth = 0; depth <= 3; depth += 1) {
      const wanted = depth === 0 ? 0 : depth - 1;
      const source = SPEND_LEVELS.slice(wanted).find((level) => levels.has(level));
      if (!source) continue;
      for (const row of rows) {
        if (row.level !== source) continue;
        const node = nodeFor(spendPath(row, depth), true);
        node.metrics.spend += row.spend;
        node.metrics.installs += row.installs;
        node.metrics.taps += row.taps;
        node.metrics.impressions += row.impressions;
        if (row.spread) node.metrics.spendEstimated = true;
      }
    }
  }

  const allNodes = Array.from(nodes.values()).sort(
    (a, b) => b.metrics.accounts - a.metrics.accounts || b.metrics.spend - a.metrics.spend,
  );
  const channelNodes = allNodes.filter((node) => node.path.length === 1);
  const paidNodes = channelNodes.filter((node) => node.paid);
  const paidTotals = emptyMetrics();
  for (const node of paidNodes) addMetrics(paidTotals, node.metrics);
  coverage.spendInRange = round(paidTotals.spend, 2);

  const levelNames: Record<string, string[]> = { ...LEVEL_NAMES };
  const channelLabels: Record<string, string> = {};
  for (const node of channelNodes) channelLabels[node.path[0]] = node.labels[0];

  const totalAccounts = cohort.length;
  const report: AcquisitionReport = {
    coverage,
    levelNames,
    channelLabels,
    nodes: allNodes,
    funnel: [
      { key: 'accounts', label: 'Created an account', users: totalAccounts, of: totalAccounts, hint: 'Accounts are created at the last onboarding step.' },
      { key: 'onboarded', label: 'Finished onboarding', users: funnel.onboarded, of: totalAccounts, hint: 'Picked focus areas and completed the intro.' },
      { key: 'activated', label: 'Completed a task', users: funnel.activated, of: totalAccounts, hint: 'The activation moment.' },
      { key: 'd1', label: 'Came back next day', users: funnel.d1Retained, of: funnel.d1Eligible, hint: 'Of accounts at least one day old.' },
      { key: 'd7', label: 'Came back on day 7', users: funnel.d7Retained, of: funnel.d7Eligible, hint: 'Of accounts at least seven days old.' },
      { key: 'trials', label: 'Started a Plus trial', users: funnel.trials, of: totalAccounts, hint: 'Production trials only.' },
      { key: 'paid', label: 'Paid', users: funnel.paid, of: totalAccounts, hint: 'Subscription or fly pack, production only.' },
    ],
  };

  const spendDepthText = Object.entries(spendDepth)
    .map(([channel, depth]) => `${channelLabel(channel)}: ${['', 'campaign', 'ad group', 'keyword'][depth]} level`)
    .join(', ');

  const treeTable = (depth: number, key: string, title: string, question: string): StatTable => {
    const levelColumns: StatColumn[] = [
      { key: 'channel', label: 'Channel' },
      { key: 'campaign', label: 'Campaign / source' },
      { key: 'ad_group', label: 'Ad group / ad set' },
      { key: 'keyword', label: 'Keyword / ad' },
    ].slice(0, depth + 1);
    return {
      key,
      title,
      question,
      columns: [...levelColumns, ...METRIC_COLUMNS, ...COST_COLUMNS],
      rows: allNodes
        .filter(
          (node) =>
            node.path.length === depth + 1 &&
            (node.paid || node.path[0] === 'campaign_link'),
        )
        .map((node) => ({
          channel: node.labels[0],
          campaign: node.labels[1] ?? '',
          ad_group: node.labels[2] ?? '',
          keyword: node.labels[3] ?? '',
          ...metricRow(node.metrics, true),
        })),
      note:
        depth === 0
          ? undefined
          : `Spend joins on campaign / ad group / keyword names. ${spendDepthText ? `Spend imported at — ${spendDepthText}.` : 'No spend imported for this range.'} Accounts arrive later than installs (onboarding runs first, and Apple Ads matching can take up to 7 days), so young rows read low.`,
    };
  };

  const channelOrder = Array.from(dailyByChannel.entries())
    .map(([channel, days]) => ({ channel, total: Array.from(days.values()).reduce((sum, value) => sum + value, 0) }))
    .sort((a, b) => b.total - a.total);
  const topChannels = channelOrder.slice(0, 4).map((entry) => entry.channel);

  const section: StatSection = {
    id: 'acquisition',
    title: 'Acquisition',
    question: 'Where do new people come from, and which sources bring the ones who stay and pay?',
    blurb: 'Channel → campaign → ad group → keyword, each with what those users did next and what they cost.',
    kpis: [
      kpi('new_users', totalAccounts, {
        sparkline: context.dates.map((date) => context.dailyNewUsers.get(date) ?? 0),
      }),
      kpi('attributed_share', pct(coverage.known, totalAccounts), {
        detail: `${coverage.known} of ${totalAccounts} known · ${coverage.awaiting} awaiting ad match · ${coverage.direct} direct`,
        sample: totalAccounts,
      }),
      kpi('paid_accounts', paidTotals.accounts, {
        detail: totalAccounts ? `${pct(paidTotals.accounts, totalAccounts)}% of new accounts` : undefined,
      }),
      kpi('ad_spend', round(paidTotals.spend, 2), {
        detail: coverage.spendImports ? (paidTotals.spendEstimated ? 'Includes evenly spread totals' : undefined) : 'No spend report imported yet',
      }),
      kpi('cost_per_account', money(paidTotals.spend, paidTotals.accounts), {
        detail: `${paidTotals.accounts} ad-attributed accounts`,
        sample: paidTotals.accounts,
      }),
      kpi('cost_per_activated', money(paidTotals.spend, paidTotals.activated), {
        detail: `${paidTotals.activated} of them completed a task`,
        sample: paidTotals.activated,
      }),
      kpi('install_to_account', paidTotals.installs ? pct(paidTotals.accounts, paidTotals.installs) : null, {
        detail: paidTotals.installs ? `${paidTotals.accounts} accounts / ${round(paidTotals.installs, 1)} reported installs` : 'Needs an imported report with installs',
        sample: Math.round(paidTotals.installs),
      }),
      kpi('paid_roas', paidTotals.spend ? round(paidTotals.revenue / paidTotals.spend, 2) : null, {
        detail: `$${round(paidTotals.revenue, 2)} revenue to date`,
        sample: paidTotals.accounts,
      }),
    ],
    series: [
      {
        key: 'acquisition.daily',
        title: 'New accounts per day, by channel',
        question: 'Is a channel growing, or did a campaign stop delivering?',
        lines: [
          ...topChannels.map((channel) => ({ key: channel, label: channelLabel(channel), format: 'integer' as const })),
          ...(channelOrder.length > 4 ? [{ key: 'other', label: 'Everything else', format: 'integer' as const }] : []),
        ],
        points: context.dates.map((date) => {
          const point: { date: string; [key: string]: string | number } = { date };
          let other = 0;
          for (const [channel, days] of Array.from(dailyByChannel.entries())) {
            const count = days.get(date) ?? 0;
            if (topChannels.includes(channel)) point[channel] = count;
            else other += count;
          }
          if (channelOrder.length > 4) point.other = other;
          return point;
        }),
      },
    ],
    tables: [
      {
        key: 'acquisition.channels',
        title: 'Channels',
        question: 'Which kinds of source bring users who activate, return, and pay?',
        columns: [{ key: 'channel', label: 'Channel' }, ...METRIC_COLUMNS, ...COST_COLUMNS],
        rows: channelNodes.map((node) => ({ channel: node.labels[0], ...metricRow(node.metrics, node.paid) })),
        note: '"Awaiting ad match" are native installs RevenueCat has not matched to an ad yet (up to 7 days); they move to an ad channel or to organic store installs. "Did a task", D1 and D7 are cohort rates; D1/D7 only count accounts old enough to have reached that day.',
      },
      treeTable(1, 'acquisition.campaigns', 'Campaigns', 'Which campaigns bring users worth paying for?'),
      treeTable(2, 'acquisition.ad_groups', 'Ad groups', 'Inside each campaign, which audience converts?'),
      treeTable(3, 'acquisition.keywords', 'Keywords & ads', 'The most specific level — which keyword or ad brought each user?'),
      {
        key: 'acquisition.referrers',
        title: 'Referring sites (all visits)',
        question: 'Which websites send visitors, including people who never signed up?',
        columns: [
          { key: 'host', label: 'Referrer' },
          { key: 'visitors', label: 'Visitors', format: 'integer' },
          { key: 'opens', label: 'Opens', format: 'integer' },
        ],
        rows: referrerRows.map((row) => ({ host: row._id, visitors: row.users.length, opens: row.count })),
        note: 'Counts app opens, signed-in or not. "none" is direct traffic, bookmarks, and the native app.',
      },
      {
        key: 'acquisition.people',
        title: 'New accounts, one row each',
        question: 'Who exactly signed up, from where, and what did they do?',
        columns: [
          { key: 'user', label: 'User' },
          { key: 'signed_up', label: 'Signed up' },
          { key: 'platform', label: 'Platform' },
          { key: 'channel', label: 'Channel' },
          { key: 'campaign', label: 'Campaign / source' },
          { key: 'ad_group', label: 'Ad group' },
          { key: 'keyword', label: 'Keyword / ad' },
          { key: 'guest', label: 'Guest' },
          { key: 'onboarded', label: 'Onboarded' },
          { key: 'tasks_week1', label: 'Tasks wk1', format: 'integer' },
          { key: 'active_days', label: 'Active days', format: 'integer' },
          { key: 'back_d1', label: 'Back D1' },
          { key: 'back_d7', label: 'Back D7' },
          { key: 'trial', label: 'Trial' },
          { key: 'paid', label: 'Paid' },
          { key: 'revenue', label: 'Revenue', format: 'money' },
          { key: 'last_seen', label: 'Last seen' },
        ],
        rows: people,
        note: 'User is the first 8 characters of the account id. Active days count days with an app open since the start of the range.',
      },
    ],
  };

  return { section, report };
}

export function emptyAcquisitionReport(): AcquisitionReport {
  return {
    coverage: {
      accounts: 0,
      known: 0,
      direct: 0,
      awaiting: 0,
      unprocessed: 0,
      revenueCatConfigured: false,
      spendImports: 0,
      spendInRange: 0,
      spendDepth: {},
    },
    levelNames: LEVEL_NAMES,
    channelLabels: {},
    nodes: [],
    funnel: [],
  };
}
