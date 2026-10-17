import { StatsEventModel as AnalyticsEventModel } from '@/lib/analytics/statsExclusion';
import type { StatSection, StatTable } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, round, type ReportContext } from './context';

const FINANCE_EVENTS = [
  'subscription_started',
  'subscription_renewed',
  'subscription_refunded',
  'purchase_completed',
  'fly_pack_purchase_completed',
];

const PAYWALL_SESSION_EVENTS = [
  'paywall_viewed',
  'paywall_prices_failed',
  'paywall_plan_selected',
  'paywall_cta_tapped',
  'paywall_account_required',
  'paywall_restore_result',
  'paywall_dismissed',
  'purchase_started',
  'purchase_completed',
  'purchase_cancelled',
  'purchase_failed',
];

const QUICK_EXIT_SECONDS = 5;
const PAYMENT_PENDING_CODE = '20';
const PLANS = ['yearly', 'monthly'];

type PaywallEventRow = {
  session: string;
  userId: string;
  name: string;
  placement?: string;
  plan?: string;
  status?: string;
  errorCode?: string;
  seconds?: number;
  environment?: string;
};

type PaywallSession = {
  userId: string;
  placement: string;
  sandbox: boolean;
  viewed: boolean;
  pricesFailed: boolean;
  planChanged: boolean;
  tappedPlan: string | null;
  accountRequired: boolean;
  started: boolean;
  completed: boolean;
  cancelled: boolean;
  failed: boolean;
  pending: boolean;
  restored: boolean;
  dismissedSeconds: number | null;
};

type PaywallOutcome =
  | 'bought'
  | 'restored'
  | 'payment_error'
  | 'backed_out'
  | 'account_step'
  | 'store_broken'
  | 'no_close'
  | 'left_fast'
  | 'looked_left';

const OUTCOME_COLUMNS: Array<{ key: Exclude<PaywallOutcome, 'restored'>; label: string; hint: string }> = [
  { key: 'left_fast', label: `Left < ${QUICK_EXIT_SECONDS}s`, hint: 'Closed without tapping the button, almost immediately. Not interested.' },
  { key: 'looked_left', label: 'Looked, then left', hint: 'Stayed a while, never tapped the button. Weighed the offer or price and said no.' },
  { key: 'store_broken', label: 'Prices never loaded', hint: 'Store prices failed, so the button stayed disabled. Our fault, not theirs.' },
  { key: 'account_step', label: 'Stuck at sign-in', hint: 'Guest tapped the button, was asked to save their frog, and never reached the payment sheet.' },
  { key: 'backed_out', label: 'Backed out at payment', hint: 'Opened the Apple / Google / web payment sheet and cancelled it.' },
  { key: 'payment_error', label: 'Payment error', hint: 'The store errored before or inside the payment sheet, or the payment is pending approval.' },
  { key: 'no_close', label: 'App closed on it', hint: 'No close event: the app was killed or backgrounded for good while the paywall was open.' },
  { key: 'bought', label: 'Bought', hint: 'The payment sheet succeeded. With a free trial this is a trial start, not money yet.' },
];

function paywallOutcome(session: PaywallSession): PaywallOutcome {
  if (session.completed) return 'bought';
  if (session.restored) return 'restored';
  if (session.failed || session.pending) return 'payment_error';
  if (session.cancelled) return 'backed_out';
  if (session.accountRequired && !session.started) return 'account_step';
  if (session.pricesFailed && !session.tappedPlan) return 'store_broken';
  if (session.dismissedSeconds === null) return 'no_close';
  return session.dismissedSeconds < QUICK_EXIT_SECONDS ? 'left_fast' : 'looked_left';
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 1);
}

function buildPaywallSessions(rows: PaywallEventRow[]) {
  const sessions = new Map<string, PaywallSession>();
  for (const row of rows) {
    const session = sessions.get(row.session) ?? {
      userId: row.userId,
      placement: 'unknown',
      sandbox: false,
      viewed: false,
      pricesFailed: false,
      planChanged: false,
      tappedPlan: null,
      accountRequired: false,
      started: false,
      completed: false,
      cancelled: false,
      failed: false,
      pending: false,
      restored: false,
      dismissedSeconds: null,
    };
    if (row.placement && session.placement === 'unknown') session.placement = row.placement;
    if (row.environment === 'SANDBOX') session.sandbox = true;
    if (row.name === 'paywall_viewed') session.viewed = true;
    else if (row.name === 'paywall_prices_failed') session.pricesFailed = true;
    else if (row.name === 'paywall_plan_selected') session.planChanged = true;
    else if (row.name === 'paywall_cta_tapped') session.tappedPlan = row.plan ?? 'unknown';
    else if (row.name === 'paywall_account_required') session.accountRequired = true;
    else if (row.name === 'paywall_restore_result') session.restored = session.restored || row.status === 'restored';
    else if (row.name === 'paywall_dismissed') session.dismissedSeconds = typeof row.seconds === 'number' ? row.seconds : 0;
    else if (row.name === 'purchase_started') session.started = true;
    else if (row.name === 'purchase_completed') session.completed = true;
    else if (row.name === 'purchase_cancelled') session.cancelled = true;
    else if (row.name === 'purchase_failed') {
      if (row.errorCode === PAYMENT_PENDING_CODE) session.pending = true;
      else session.failed = true;
    }
    sessions.set(row.session, session);
  }
  return Array.from(sessions.values()).filter((session) => session.viewed && !session.sandbox);
}

function groupByPlacement(sessions: PaywallSession[]) {
  const groups = new Map<string, PaywallSession[]>();
  for (const session of sessions) {
    const list = groups.get(session.placement) ?? [];
    list.push(session);
    groups.set(session.placement, list);
  }
  const rows = Array.from(groups, ([placement, list]) => ({ placement, list })).sort(
    (a, b) => b.list.length - a.list.length,
  );
  return rows.length > 1 ? [{ placement: 'All triggers', list: sessions }, ...rows] : rows;
}

export async function buildMoney(context: ReportContext): Promise<StatSection> {
  const production = { 'properties.environment': { $ne: 'SANDBOX' } };

  const [revenueRows, dailyRevenue, paywallRows, adRows, packRows, productRows, trialRows, expiredRows] =
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
      AnalyticsEventModel.aggregate<PaywallEventRow>([
        {
          $match: {
            occurredAt: context.window,
            name: { $in: PAYWALL_SESSION_EVENTS },
            'properties.paywall_session': { $exists: true },
          },
        },
        { $sort: { occurredAt: 1 } },
        {
          $project: {
            _id: 0,
            session: '$properties.paywall_session',
            userId: 1,
            name: 1,
            placement: '$properties.placement',
            plan: '$properties.plan',
            status: '$properties.status',
            errorCode: '$properties.error_code',
            seconds: '$properties.seconds_elapsed',
            environment: '$properties.environment',
          },
        },
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
      AnalyticsEventModel.aggregate<{ _id: string; startedAt: Date; placement?: string }>([
        {
          $match: {
            occurredAt: context.window,
            name: 'subscription_started',
            source: 'revenuecat',
            'properties.period_type': 'TRIAL',
            ...production,
          },
        },
        { $sort: { occurredAt: 1 } },
        {
          $group: {
            _id: '$userId',
            startedAt: { $first: '$occurredAt' },
            placement: { $first: '$properties.placement' },
          },
        },
      ]),
      AnalyticsEventModel.aggregate<{ _id: string }>([
        {
          $match: {
            occurredAt: context.window,
            name: 'subscription_expired',
            source: 'revenuecat',
            ...production,
          },
        },
        { $group: { _id: '$userId' } },
      ]),
    ]);

  const trialUserIds = trialRows.map((row) => row._id);
  const expiredUserIds = expiredRows.map((row) => row._id);
  const [trialOutcomeRows, paidHistoryRows] = await Promise.all([
    trialUserIds.length
      ? AnalyticsEventModel.aggregate<{ userId: string; name: string; occurredAt: Date }>([
          {
            $match: {
              userId: { $in: trialUserIds },
              occurredAt: { $gte: context.range.start },
              source: 'revenuecat',
              ...production,
              $or: [
                { name: 'subscription_renewed', 'properties.is_trial_conversion': true },
                { name: 'subscription_expired' },
              ],
            },
          },
          { $project: { _id: 0, userId: 1, name: 1, occurredAt: 1 } },
        ])
      : Promise.resolve([]),
    expiredUserIds.length
      ? AnalyticsEventModel.aggregate<{ _id: string }>([
          {
            $match: {
              userId: { $in: expiredUserIds },
              occurredAt: { $lt: context.range.endExclusive },
              source: 'revenuecat',
              ...production,
              $or: [
                { name: 'subscription_renewed' },
                { name: 'subscription_started', 'properties.period_type': { $ne: 'TRIAL' } },
              ],
            },
          },
          { $group: { _id: '$userId' } },
        ])
      : Promise.resolve([]),
  ]);

  const financeByName = new Map(revenueRows.map((row) => [row._id, row]));
  const finance = (name: string) =>
    financeByName.get(name) ?? { count: 0, users: 0, revenue: 0, proceeds: 0 };

  const grossRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
  const proceeds = revenueRows.reduce((sum, row) => sum + row.proceeds, 0);
  const dailyMap = new Map(dailyRevenue.map((row) => [row._id, row]));

  const cancelled = context.metric('subscription_cancelled');
  const lapsedPaid = paidHistoryRows.length;

  const paywallSessions = buildPaywallSessions(paywallRows);
  const placementGroups = groupByPlacement(paywallSessions);
  const sessionNote = 'One row per time the Plus paywall opened. Counting starts when per-showing tracking shipped (October 2026), so earlier ranges are empty here. Sandbox purchases are excluded.';

  const paywallFunnelTable: StatTable = {
    key: 'money.paywall_funnel',
    title: 'Plus paywall funnel by trigger',
    question: 'For each trigger, how far do people get between seeing the offer and paying?',
    columns: [
      { key: 'placement', label: 'Trigger' },
      { key: 'shown', label: 'Shown', format: 'integer' },
      { key: 'people', label: 'People', format: 'integer' },
      { key: 'prices_failed', label: 'Prices failed', format: 'integer', hint: 'Store prices did not load, so the button was disabled.' },
      { key: 'switched', label: 'Switched plan', format: 'integer', hint: 'Changed the preselected plan at least once.' },
      { key: 'tapped', label: 'Tapped button', format: 'integer' },
      { key: 'tap_rate', label: 'Shown → tap', format: 'percent' },
      { key: 'sheet', label: 'Payment sheet', format: 'integer', hint: 'Apple / Google / web checkout was requested.' },
      { key: 'succeeded', label: 'Succeeded', format: 'integer' },
      { key: 'cancelled', label: 'Cancelled', format: 'integer' },
      { key: 'failed', label: 'Failed', format: 'integer' },
      { key: 'conversion', label: 'Shown → success', format: 'percent' },
    ],
    rows: placementGroups.map(({ placement, list }) => {
      const count = (test: (session: PaywallSession) => boolean) => list.filter(test).length;
      const tapped = count((session) => session.tappedPlan !== null);
      const succeeded = count((session) => session.completed);
      return {
        placement,
        shown: list.length,
        people: new Set(list.map((session) => session.userId)).size,
        prices_failed: count((session) => session.pricesFailed),
        switched: count((session) => session.planChanged),
        tapped,
        tap_rate: rate(tapped, list.length),
        sheet: count((session) => session.started),
        succeeded,
        cancelled: count((session) => session.cancelled),
        failed: count((session) => session.failed || session.pending),
        conversion: rate(succeeded, list.length),
      };
    }),
    note: sessionNote,
  };

  const outcomesBySession = paywallSessions.map((session) => ({ session, outcome: paywallOutcome(session) }));
  const pendingCount = paywallSessions.filter((session) => session.pending && !session.completed).length;
  const restoredCount = outcomesBySession.filter((entry) => entry.outcome === 'restored').length;
  const paywallExitTable: StatTable = {
    key: 'money.paywall_exits',
    title: 'Where each Plus paywall showing ended',
    question: 'Are people not interested, put off by the offer, or lost at the payment sheet?',
    columns: [
      { key: 'placement', label: 'Trigger' },
      { key: 'shown', label: 'Shown', format: 'integer' },
      ...OUTCOME_COLUMNS.map((column) => ({ key: column.key, label: column.label, format: 'percent' as const, hint: column.hint })),
      { key: 'median_seconds', label: 'Median seconds before leaving', format: 'decimal', hint: 'Over showings closed without buying.' },
    ],
    rows: placementGroups.map(({ placement, list }) => {
      const outcomes = list.map(paywallOutcome);
      const row: Record<string, string | number | null> = { placement, shown: list.length };
      for (const column of OUTCOME_COLUMNS) {
        row[column.key] = rate(outcomes.filter((outcome) => outcome === column.key).length, list.length);
      }
      row.median_seconds = median(
        list
          .filter((session) => !session.completed && session.dismissedSeconds !== null)
          .map((session) => session.dismissedSeconds as number),
      );
      return row;
    }),
    note: `Each showing lands in exactly one column, as a share of Shown. Left < ${QUICK_EXIT_SECONDS}s reads as not interested; Looked, then left as weighed it and said no; Backed out at payment as lost at the Apple sheet. Prices never loaded and Stuck at sign-in are showings we lost, not the offer.${pendingCount ? ` Payment error includes ${pendingCount} pending payment${pendingCount === 1 ? '' : 's'} (Ask to Buy or bank approval) that may still complete.` : ''}${restoredCount ? ` ${restoredCount} showing${restoredCount === 1 ? '' : 's'} ended in a restore and sit in no column.` : ''}`,
  };

  const planSwitches = new Map<string, number>();
  for (const row of paywallRows) {
    if (row.name === 'paywall_plan_selected' && row.plan) {
      planSwitches.set(row.plan, (planSwitches.get(row.plan) ?? 0) + 1);
    }
  }
  const paywallPlanTable: StatTable = {
    key: 'money.paywall_plans',
    title: 'Plan picked at the button',
    question: 'Which plan do people choose, and does one of them scare people off at the payment sheet?',
    columns: [
      { key: 'plan', label: 'Plan' },
      { key: 'switched_to', label: 'Switched to it', format: 'integer', hint: 'Times someone changed the selection to this plan. Yearly is preselected.' },
      { key: 'tapped', label: 'Tapped button', format: 'integer' },
      { key: 'sheet', label: 'Payment sheet', format: 'integer' },
      { key: 'succeeded', label: 'Succeeded', format: 'integer' },
      { key: 'cancelled', label: 'Cancelled', format: 'integer' },
      { key: 'tap_to_success', label: 'Tap → success', format: 'percent' },
    ],
    rows: PLANS.map((plan) => {
      const list = paywallSessions.filter((session) => session.tappedPlan === plan);
      const succeeded = list.filter((session) => session.completed).length;
      return {
        plan,
        switched_to: planSwitches.get(plan) ?? 0,
        tapped: list.length,
        sheet: list.filter((session) => session.started).length,
        succeeded,
        cancelled: list.filter((session) => session.cancelled).length,
        tap_to_success: rate(succeeded, list.length),
      };
    }),
    note: 'Plan is the one selected at the last button tap of each showing.',
  };

  const trialOutcomes = new Map<string, { converted: number | null; expired: number | null }>();
  for (const row of trialOutcomeRows) {
    const entry = trialOutcomes.get(row.userId) ?? { converted: null, expired: null };
    const at = new Date(row.occurredAt).getTime();
    const slot = row.name === 'subscription_expired' ? 'expired' : 'converted';
    entry[slot] = entry[slot] === null ? at : Math.min(entry[slot] as number, at);
    trialOutcomes.set(row.userId, entry);
  }
  const trials = trialRows.map((row) => {
    const startedAt = new Date(row.startedAt).getTime();
    const entry = trialOutcomes.get(row._id);
    const converted = entry?.converted !== null && entry?.converted !== undefined && entry.converted >= startedAt ? entry.converted : null;
    const expiredAt = entry?.expired !== null && entry?.expired !== undefined && entry.expired >= startedAt ? entry.expired : null;
    const outcome =
      converted !== null && (expiredAt === null || converted <= expiredAt)
        ? 'paid'
        : expiredAt !== null
          ? 'ended'
          : 'in_trial';
    return { placement: typeof row.placement === 'string' ? row.placement : 'Not recorded', outcome };
  });
  const trialGroups = new Map<string, typeof trials>();
  for (const trial of trials) {
    const list = trialGroups.get(trial.placement) ?? [];
    list.push(trial);
    trialGroups.set(trial.placement, list);
  }
  const trialRowsByPlacement = Array.from(trialGroups, ([placement, list]) => ({ placement, list })).sort(
    (a, b) => b.list.length - a.list.length,
  );
  const trialSummary = (list: typeof trials) => {
    const paid = list.filter((trial) => trial.outcome === 'paid').length;
    const ended = list.filter((trial) => trial.outcome === 'ended').length;
    return { paid, ended, inTrial: list.length - paid - ended };
  };
  const allTrials = trialSummary(trials);
  const trialTable: StatTable = {
    key: 'money.trials',
    title: 'Plus trials by trigger',
    question: 'Which trigger brings trials that turn into paying subscribers?',
    columns: [
      { key: 'placement', label: 'Trigger' },
      { key: 'trials', label: 'Trials started', format: 'integer' },
      { key: 'paid', label: 'Paid after trial', format: 'integer' },
      { key: 'ended', label: 'Ended unpaid', format: 'integer' },
      { key: 'in_trial', label: 'Still in trial', format: 'integer' },
      { key: 'trial_to_paid', label: 'Trial → paid', format: 'percent', hint: 'Paid over trials that have ended either way. Still-running trials are left out.' },
    ],
    rows: (trialRowsByPlacement.length > 1
      ? [{ placement: 'All triggers', list: trials }, ...trialRowsByPlacement]
      : trialRowsByPlacement
    ).map(({ placement, list }) => {
      const summary = trialSummary(list);
      return {
        placement,
        trials: list.length,
        paid: summary.paid,
        ended: summary.ended,
        in_trial: summary.inTrial,
        trial_to_paid: summary.paid + summary.ended ? rate(summary.paid, summary.paid + summary.ended) : null,
      };
    }),
    note: 'Trials started in the range, followed to today. The trigger is saved on the store purchase itself, so trials from before October 2026 show as Not recorded. Sandbox is excluded.',
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
      kpi('trial_to_paid', allTrials.paid + allTrials.ended ? rate(allTrials.paid, allTrials.paid + allTrials.ended) : null, {
        detail: `${allTrials.paid} paid, ${allTrials.ended} ended unpaid, ${allTrials.inTrial} still in trial of ${trials.length} trials started`,
        sample: allTrials.paid + allTrials.ended,
      }),
      kpi('subscription_churn', rate(lapsedPaid, lapsedPaid + context.premiumUsers), {
        detail: `${lapsedPaid} paying subscribers lapsed, ${context.premiumUsers} on Plus now, ${cancelled.users} turned off auto-renew`,
        sample: lapsedPaid + context.premiumUsers,
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
      paywallFunnelTable,
      paywallExitTable,
      paywallPlanTable,
      trialTable,
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
