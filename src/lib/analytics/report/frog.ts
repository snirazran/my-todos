import type { StatSection } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, type ReportContext } from './context';
import { mixTable, propertyMix } from './dimensions';

const REVIEW_OUTCOMES: Record<string, string> = {
  app_review_requested: 'Asked the store',
  app_review_skipped: 'Skipped',
  app_review_suppressed: 'Paused after a bad moment',
};

export async function buildFrog(context: ReportContext): Promise<StatSection> {
  const [streakMix, notificationRows, openRows, hungerRows, reviewRows, goalRows] = await Promise.all([
    propertyMix({ occurredAt: context.window, name: 'streak_checked_in' }, [
      'streak_tier',
      'is_premium',
      'streak_length',
    ]),
    groupByProperties(
      { occurredAt: context.window, name: 'notification_sent' },
      { type: 'notification_type', slot: 'slot' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'notification_opened' },
      { type: 'notification_type' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'hunger_resolved' },
      { method: 'method' },
    ),
    groupByProperties(
      {
        occurredAt: context.window,
        name: { $in: ['app_review_requested', 'app_review_skipped', 'app_review_suppressed'] },
      },
      { event: '$name', reason: 'reason', blocker: 'blocker', moment: 'moment' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: { $in: ['streak_goal_set', 'streak_goal_reached'] } },
      { event: '$name', days: 'days' },
    ),
  ]);

  const checkIns = context.metric('streak_checked_in');
  const broken = context.metric('streak_broken');
  const shields = context.metric('streak_shield_used');
  const shieldPurchases = context.metric('shield_purchased');
  const hungerStarted = context.metric('hunger_started');
  const hungerResolved = context.metric('hunger_resolved');
  const sent = context.metric('notification_sent');
  const opened = context.metric('notification_opened');

  const extended = streakMix
    .filter((row) => row._id.key === 'streak_tier' && row._id.value !== 'none')
    .reduce((sum, row) => sum + row.count, 0);

  const openByType = new Map(openRows.map((row) => [String(row._id.type), row]));

  return {
    id: 'frog',
    title: 'Frog & streaks',
    question: 'Is the pet loop pulling people back every day?',
    blurb: 'Login streaks, freezes, hunger, and the daily return ritual.',
    kpis: [
      kpi('streak_checkins', checkIns.events, {
        sparkline: context.seriesFor('streak_checked_in'),
        detail: `${checkIns.users} users checked in`,
      }),
      kpi('streak_extended_rate', rate(extended, checkIns.events), {
        sample: checkIns.events,
      }),
      kpi('streak_breaks', broken.events, { sparkline: context.seriesFor('streak_broken') }),
      kpi('shield_saves', shields.events, {
        detail: `${shieldPurchases.events} shields bought`,
      }),
      kpi('hunger_entries', hungerStarted.events),
      kpi('hunger_recovery_rate', rate(hungerResolved.events, hungerStarted.events), {
        sample: hungerStarted.events,
      }),
      kpi('notifications_sent', sent.events, { sparkline: context.seriesFor('notification_sent') }),
      kpi('notification_open_rate', rate(opened.events, sent.events), {
        detail: `${opened.events} opens from ${sent.events} sends`,
        sample: sent.events,
      }),
    ],
    series: [
      {
        key: 'frog.daily',
        title: 'Daily return ritual',
        question: 'Do check-ins hold steady, and do breaks cluster on particular days?',
        lines: [
          { key: 'checkins', label: 'Check-ins', format: 'integer' },
          { key: 'breaks', label: 'Streaks broken', format: 'integer' },
          { key: 'notifications', label: 'Notifications sent', format: 'integer' },
        ],
        points: context.dates.map((date, index) => ({
          date,
          checkins: context.seriesFor('streak_checked_in')[index] ?? 0,
          breaks: context.seriesFor('streak_broken')[index] ?? 0,
          notifications: context.seriesFor('notification_sent')[index] ?? 0,
        })),
      },
    ],
    tables: [
      {
        key: 'frog.notifications',
        title: 'Notification performance',
        question: 'Which message in the priority ladder deserves its slot?',
        columns: [
          { key: 'type', label: 'Message' },
          { key: 'slot', label: 'Slot' },
          { key: 'sent', label: 'Sent', format: 'integer' },
          { key: 'recipients', label: 'Recipients', format: 'integer' },
          { key: 'opened', label: 'Opened', format: 'integer' },
          { key: 'open_rate', label: 'Open rate', format: 'percent' },
        ],
        rows: notificationRows.map((row) => {
          const open = openByType.get(String(row._id.type));
          return {
            type: String(row._id.type),
            slot: String(row._id.slot),
            sent: row.count,
            recipients: row.users,
            opened: open?.count ?? 0,
            open_rate: rate(open?.count ?? 0, row.count),
          };
        }),
        note: 'Only two notifications a day get through the cap, so a low open rate here is a slot being wasted.',
      },
      mixTable({
        key: 'frog.streak_mix',
        title: 'Streak length distribution',
        question: 'Are people building long streaks, or resetting to one over and over?',
        rows: streakMix,
        total: checkIns.events,
        countLabel: 'Check-ins',
        order: ['streak_tier', 'is_premium'],
      }),
      {
        key: 'frog.hunger',
        title: 'Hunger recovery',
        question: 'When the frog goes hungry, do people come back and feed it?',
        columns: [
          { key: 'method', label: 'Recovery method' },
          { key: 'events', label: 'Recoveries', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'share', label: 'Share of hunger events', format: 'percent' },
        ],
        rows: hungerRows.map((row) => ({
          method: String(row._id.method),
          events: row.count,
          users: row.users,
          share: rate(row.count, hungerStarted.events),
        })),
      },
      {
        key: 'frog.streak_goals',
        title: 'Streak goals',
        question: 'Which streak goal do people pledge, and do they keep it?',
        columns: [
          { key: 'days', label: 'Goal (days)' },
          { key: 'set', label: 'Pledged', format: 'integer' },
          { key: 'reached', label: 'Reached', format: 'integer' },
          { key: 'reach_rate', label: 'Reached / pledged', format: 'percent' },
        ],
        rows: Array.from(new Set(goalRows.map((row) => Number(row._id.days))))
          .sort((a, b) => a - b)
          .map((days) => {
            const count = (event: string) =>
              goalRows.find((row) => Number(row._id.days) === days && row._id.event === event)?.count ?? 0;
            const set = count('streak_goal_set');
            const reached = count('streak_goal_reached');
            return { days: String(days), set, reached, reach_rate: set ? rate(reached, set) : null };
          }),
        note: 'Both counts fall inside the selected range, so a long goal pledged near the end shows as pledged but not yet reached. Counting started October 2026.',
      },
      {
        key: 'frog.app_review',
        title: 'App review prompt',
        question: 'Do people reach the review prompt, and what stops them?',
        columns: [
          { key: 'outcome', label: 'Outcome' },
          { key: 'reason', label: 'Reason' },
          { key: 'blocker', label: 'Blocked by' },
          { key: 'moment', label: 'Moment' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: reviewRows
          .map((row) => ({
            outcome: REVIEW_OUTCOMES[String(row._id.event)] ?? String(row._id.event),
            reason: String(row._id.reason),
            blocker: String(row._id.blocker),
            moment: String(row._id.moment),
            events: row.count,
            users: row.users,
          }))
          .sort(
            (a, b) =>
              Number(b.outcome === REVIEW_OUTCOMES.app_review_requested) -
                Number(a.outcome === REVIEW_OUTCOMES.app_review_requested) ||
              b.events - a.events,
          ),
        note: 'The store decides whether the prompt actually appears (iOS allows 3 a year) and never tells the app, so "Asked the store" is as far as we can see. Skip reasons are tracked from 2026-10-19.',
      },
    ],
  };
}
