import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import type { StatSection, StatTable } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, round, type ReportContext } from './context';

const FINANCE_EVENTS = [
  'subscription_started',
  'subscription_renewed',
  'subscription_refunded',
  'purchase_completed',
  'fly_pack_purchase_completed',
];

const PAYWALL_STEPS = ['Intro', 'Benefits', 'Trial reminder', 'Plan selection'];

export async function buildMoney(context: ReportContext): Promise<StatSection> {
  const production = { 'properties.environment': { $ne: 'SANDBOX' } };

  const [revenueRows, dailyRevenue, stepRows, adRows, packRows, productRows] =
    await Promise.all([
      AnalyticsEventModel.aggregate<{
        _id: string;
        count: number;
        users: number;
        revenue: number;
        proceeds: number;
      }>([
        {
          $match: {
            occurredAt: context.window,
            name: { $in: FINANCE_EVENTS },
            ...production,
          },
        },
        {
          $group: {
            _id: '$name',
            count: { $sum: 1 },
            userSet: { $addToSet: '$userId' },
            revenue: { $sum: { $ifNull: ['$properties.revenue_usd', { $ifNull: ['$properties.price_usd', 0] }] } },
            proceeds: { $sum: { $ifNull: ['$properties.proceeds_usd', 0] } },
          },
        },
        { $project: { count: 1, revenue: 1, proceeds: 1, users: { $size: '$userSet' } } },
      ]),
      AnalyticsEventModel.aggregate<{ _id: string; revenue: number; proceeds: number }>([
        {
          $match: {
            occurredAt: context.window,
            name: { $in: FINANCE_EVENTS },
            ...production,
          },
        },
        {
          $group: {
            _id: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
            revenue: { $sum: { $ifNull: ['$properties.revenue_usd', { $ifNull: ['$properties.price_usd', 0] }] } },
            proceeds: { $sum: { $ifNull: ['$properties.proceeds_usd', 0] } },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<{
        _id: { placement: string; name: string; step: number };
        count: number;
        users: number;
      }>([
        {
          $match: {
            occurredAt: context.window,
            name: {
              $in: [
                'paywall_viewed',
                'paywall_step_viewed',
                'purchase_started',
                'purchase_completed',
                'purchase_cancelled',
                'purchase_failed',
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              placement: { $ifNull: ['$properties.placement', 'unknown'] },
              name: '$name',
              step: { $ifNull: ['$properties.step', 0] },
            },
            count: { $sum: 1 },
            userSet: { $addToSet: '$userId' },
          },
        },
        { $project: { count: 1, users: { $size: '$userSet' } } },
      ]),
      AnalyticsEventModel.aggregate<{
        _id: { placement: string; name: string };
        count: number;
        users: number;
      }>([
        { $match: { occurredAt: context.window, category: 'ads' } },
        {
          $group: {
            _id: {
              placement: { $ifNull: ['$properties.placement', 'unknown'] },
              name: '$name',
            },
            count: { $sum: 1 },
            userSet: { $addToSet: '$userId' },
          },
        },
        { $project: { count: 1, users: { $size: '$userSet' } } },
      ]),
      groupByProperties(
        { occurredAt: context.window, name: { $regex: '^fly_pack_' } },
        { packId: 'pack_id', stage: '$name' },
        { sums: { revenue: 'price_usd', flies: 'fly_amount' } },
      ),
      groupByProperties(
        { occurredAt: context.window, name: 'subscription_started', ...production },
        { product: 'product_id', period: 'period_type', store: 'store' },
        { sums: { revenue: 'revenue_usd', proceeds: 'proceeds_usd' } },
      ),
    ]);

  const financeByName = new Map(revenueRows.map((row) => [row._id, row]));
  const finance = (name: string) =>
    financeByName.get(name) ?? { count: 0, users: 0, revenue: 0, proceeds: 0 };

  const grossRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
  const proceeds = revenueRows.reduce((sum, row) => sum + row.proceeds, 0);
  const dailyMap = new Map(dailyRevenue.map((row) => [row._id, row]));

  const started = finance('subscription_started');
  const cancelled = context.metric('subscription_cancelled');
  const expired = context.metric('subscription_expired');

  const placements = new Map<
    string,
    { events: Map<string, { count: number; users: number }>; steps: Map<number, { count: number; users: number }> }
  >();
  for (const row of stepRows) {
    const entry =
      placements.get(row._id.placement) ??
      { events: new Map<string, { count: number; users: number }>(), steps: new Map<number, { count: number; users: number }>() };
    if (row._id.name === 'paywall_step_viewed') {
      entry.steps.set(row._id.step, { count: row.count, users: row.users });
    } else {
      entry.events.set(row._id.name, { count: row.count, users: row.users });
    }
    placements.set(row._id.placement, entry);
  }

  const paywallTable: StatTable = {
    key: 'money.paywall_placements',
    title: 'Paywall by trigger',
    question: 'Which trigger earns its interruption, and which one just annoys people?',
    columns: [
      { key: 'placement', label: 'Trigger' },
      { key: 'views', label: 'Views', format: 'integer' },
      { key: 'viewers', label: 'Viewers', format: 'integer' },
      { key: 'starts', label: 'Started', format: 'integer' },
      { key: 'completed', label: 'Bought', format: 'integer' },
      { key: 'cancelled', label: 'Cancelled', format: 'integer' },
      { key: 'failed', label: 'Failed', format: 'integer' },
      { key: 'start_rate', label: 'View → start', format: 'percent' },
      { key: 'conversion', label: 'View → buy', format: 'percent' },
    ],
    rows: Array.from(placements, ([placement, entry]) => {
      const views = entry.events.get('paywall_viewed') ?? { count: 0, users: 0 };
      const starts = entry.events.get('purchase_started') ?? { count: 0, users: 0 };
      const bought = entry.events.get('purchase_completed') ?? { count: 0, users: 0 };
      return {
        placement,
        views: views.count,
        viewers: views.users,
        starts: starts.count,
        completed: bought.count,
        cancelled: entry.events.get('purchase_cancelled')?.count ?? 0,
        failed: entry.events.get('purchase_failed')?.count ?? 0,
        start_rate: rate(starts.users, views.users),
        conversion: rate(bought.users, views.users),
      };
    }).sort((a, b) => b.views - a.views),
  };

  const stepTable: StatTable = {
    key: 'money.paywall_steps',
    title: 'Plus popup step drop-off',
    question: 'Which screen of the Plus popup loses people?',
    columns: [
      { key: 'placement', label: 'Trigger' },
      { key: 'step', label: 'Step' },
      { key: 'users', label: 'Reached', format: 'integer' },
      { key: 'reach_rate', label: '% of viewers', format: 'percent' },
      { key: 'step_conversion', label: 'From previous step', format: 'percent' },
    ],
    rows: Array.from(placements).flatMap(([placement, entry]) => {
      const views = entry.events.get('paywall_viewed') ?? { count: 0, users: 0 };
      return PAYWALL_STEPS.map((label, index) => {
        const current = entry.steps.get(index + 1) ?? (index === 0 ? views : { count: 0, users: 0 });
        const previous =
          index === 0 ? views.users : entry.steps.get(index)?.users ?? (index === 1 ? views.users : 0);
        return {
          placement,
          step: `${index + 1}. ${label}`,
          users: current.users,
          reach_rate: rate(current.users, views.users),
          step_conversion: rate(current.users, previous),
        };
      });
    }),
  };

  const adPlacements = new Map<string, Record<string, number>>();
  for (const row of adRows) {
    const values = adPlacements.get(row._id.placement) ?? {};
    values[row._id.name] = row.count;
    adPlacements.set(row._id.placement, values);
  }
  const adTable: StatTable = {
    key: 'money.ads',
    title: 'Rewarded ads by placement',
    question: 'Which placement fills, and which one is silently failing?',
    columns: [
      { key: 'placement', label: 'Placement' },
      { key: 'requested', label: 'Requested', format: 'integer' },
      { key: 'impressions', label: 'Shown', format: 'integer' },
      { key: 'completed', label: 'Completed', format: 'integer' },
      { key: 'dismissed', label: 'Dismissed', format: 'integer' },
      { key: 'failed', label: 'Failed', format: 'integer' },
      { key: 'fill_rate', label: 'Fill rate', format: 'percent' },
      { key: 'completion_rate', label: 'Completion', format: 'percent' },
    ],
    rows: Array.from(adPlacements, ([placement, values]) => ({
      placement,
      requested: values.ad_requested ?? 0,
      impressions: values.ad_impression ?? 0,
      completed: values.ad_completed ?? 0,
      dismissed: values.ad_dismissed ?? 0,
      failed: values.ad_failed ?? 0,
      fill_rate: rate(values.ad_impression ?? 0, values.ad_requested ?? 0),
      completion_rate: rate(values.ad_completed ?? 0, values.ad_requested ?? 0),
    })).sort((a, b) => b.requested - a.requested),
  };

  const adRequested = Array.from(adPlacements.values()).reduce(
    (sum, values) => sum + (values.ad_requested ?? 0),
    0,
  );
  const adCompleted = Array.from(adPlacements.values()).reduce(
    (sum, values) => sum + (values.ad_completed ?? 0),
    0,
  );

  return {
    id: 'money',
    title: 'Money',
    question: 'Do the paywall, packs, and ads convert?',
    blurb: 'Plus subscriptions, fly packs, rewarded ads, and what they actually pay.',
    kpis: [
      kpi('gross_revenue', round(grossRevenue, 2), {
        sparkline: context.dates.map((date) => round(dailyMap.get(date)?.revenue ?? 0, 2)),
      }),
      kpi('proceeds', round(proceeds, 2)),
      kpi('arpdau', round(grossRevenue / Math.max(1, context.activeUsers * context.range.days), 4)),
      kpi('paywall_conversion', rate(context.users('purchase_completed'), context.users('paywall_viewed')), {
        detail: `${context.users('purchase_completed')} buyers of ${context.users('paywall_viewed')} who saw a paywall`,
        sample: context.users('paywall_viewed'),
      }),
      kpi('plus_share', rate(context.premiumUsers, context.totalUsers), {
        detail: `${context.premiumUsers} Plus accounts`,
        sample: context.totalUsers,
      }),
      kpi('subscription_churn', rate(cancelled.events + expired.events, started.count), {
        detail: `${started.count} started, ${cancelled.events} cancelled, ${expired.events} expired`,
        sample: started.count,
      }),
      kpi('ad_completion_rate', rate(adCompleted, adRequested), { sample: adRequested }),
      kpi('ad_impressions', context.events('ad_impression')),
    ],
    series: [
      {
        key: 'money.revenue',
        title: 'Revenue per day',
        question: 'Is revenue trending, or is it a handful of spikes?',
        lines: [
          { key: 'revenue', label: 'Gross', format: 'money' },
          { key: 'proceeds', label: 'Proceeds', format: 'money' },
        ],
        points: context.dates.map((date) => ({
          date,
          revenue: round(dailyMap.get(date)?.revenue ?? 0, 2),
          proceeds: round(dailyMap.get(date)?.proceeds ?? 0, 2),
        })),
      },
    ],
    tables: [
      {
        key: 'money.subscription_lifecycle',
        title: 'Subscription lifecycle',
        question: 'Is the subscriber base growing net of churn?',
        columns: [
          { key: 'event', label: 'Event' },
          { key: 'count', label: 'Count', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'revenue', label: 'Gross', format: 'money' },
          { key: 'proceeds', label: 'Proceeds', format: 'money' },
        ],
        rows: [
          'subscription_started',
          'subscription_renewed',
          'subscription_cancelled',
          'subscription_expired',
          'subscription_billing_issue',
          'subscription_refunded',
          'subscription_product_changed',
        ].map((name) => {
          const row = financeByName.get(name);
          const fallback = context.metric(name);
          return {
            event: name.replace('subscription_', '').replace(/_/g, ' '),
            count: row?.count ?? fallback.events,
            users: row?.users ?? fallback.users,
            revenue: round(row?.revenue ?? 0, 2),
            proceeds: round(row?.proceeds ?? 0, 2),
          };
        }),
        note: 'Sandbox transactions are excluded from every money column.',
      },
      paywallTable,
      stepTable,
      {
        key: 'money.products',
        title: 'Products sold',
        question: 'Which plan and store carry the revenue?',
        columns: [
          { key: 'product', label: 'Product' },
          { key: 'period', label: 'Period' },
          { key: 'store', label: 'Store' },
          { key: 'sales', label: 'Sales', format: 'integer' },
          { key: 'users', label: 'Buyers', format: 'integer' },
          { key: 'revenue', label: 'Gross', format: 'money' },
        ],
        rows: productRows.map((row) => ({
          product: String(row._id.product),
          period: String(row._id.period),
          store: String(row._id.store),
          sales: row.count,
          users: row.users,
          revenue: round(row.revenue, 2),
        })),
      },
      {
        key: 'money.fly_packs',
        title: 'Fly packs',
        question: 'Does the fly shop convert browsing into purchases?',
        columns: [
          { key: 'pack', label: 'Pack' },
          { key: 'stage', label: 'Stage' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'revenue', label: 'Revenue', format: 'money' },
        ],
        rows: packRows.map((row) => ({
          pack: String(row._id.packId),
          stage: String(row._id.stage).replace('fly_pack_', '').replace(/_/g, ' '),
          events: row.count,
          users: row.users,
          revenue: round(row.revenue, 2),
        })),
        note: `Fly shop opened ${context.events('fly_shop_viewed')} times by ${context.users('fly_shop_viewed')} users.`,
      },
      adTable,
    ],
  };
}
