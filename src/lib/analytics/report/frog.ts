import type { StatRow, StatSection } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, type ReportContext } from './context';
import { mixTable, propertyMix } from './dimensions';

const REVIEW_OUTCOMES: Record<string, string> = {
  app_review_requested: 'Asked the store',
  app_review_skipped: 'Skipped',
  app_review_suppressed: 'Paused after a bad moment',
};

const SELF_SET_REMINDER = 'scheduled_task_reminder';

const PERMISSION_STATUS: Record<string, string> = {
  granted: 'Allowed',
  denied: "Don't Allow",
  dismissed: 'Closed without answering',
  later: 'Maybe later',
  unsupported: 'Not supported',
  failed: 'Failed',
};

const PERMISSION_OUTCOME: Record<string, string> = {
  prompted: 'Saw the system prompt',
  already_set: 'Answered before',
  skipped: 'No prompt',
};

type CountRow = { _id: Record<string, unknown>; count: number; users: number };

const VOICE_VARIANT: Record<string, string> = {
  unknown: 'Old style (hook in the title)',
  frog_sender_v1: 'Frog talks (his name in the title)',
};

function voiceTable(sendRows: CountRow[], openRows: CountRow[]): StatRow[] {
  const totals = new Map<string, { sent: number; opened: number }>();
  const add = (rows: CountRow[], field: 'sent' | 'opened') => {
    rows.forEach((row) => {
      if (String(row._id.type) === SELF_SET_REMINDER) return;
      const variant = String(row._id.variant);
      const entry = totals.get(variant) ?? { sent: 0, opened: 0 };
      entry[field] += row.count;
      totals.set(variant, entry);
    });
  };
  add(sendRows, 'sent');
  add(openRows, 'opened');
  const rows: StatRow[] = [];
  totals.forEach((entry, variant) => {
    rows.push({
      variant: VOICE_VARIANT[variant] ?? variant,
      sent: entry.sent,
      opened: entry.opened,
      open_rate: entry.sent > 0 ? rate(entry.opened, entry.sent) : null,
    });
  });
  return rows;
}

function notificationTable(sendRows: CountRow[], openRows: CountRow[]) {
  const key = (type: unknown, slot: unknown) => `${String(type)}|${String(slot)}`;
  const opens = new Map(openRows.map((row) => [key(row._id.type, row._id.slot), row.count]));
  const slotsByType = new Map<string, number>();
  for (const row of sendRows) {
    const type = String(row._id.type);
    slotsByType.set(type, (slotsByType.get(type) ?? 0) + 1);
  }
  const used = new Set<string>();
  const take = (k: string) => {
    used.add(k);
    return opens.get(k) ?? 0;
  };
  const rows: StatRow[] = sendRows.map((row) => {
    const type = String(row._id.type);
    const slot = String(row._id.slot);
    const unslotted =
      slot !== 'unknown' && slotsByType.get(type) === 1 ? take(key(type, 'unknown')) : 0;
    const opened = take(key(type, slot)) + unslotted;
    return {
      type,
      slot,
      sent: row.count,
      recipients: row.users,
      opened,
      open_rate: rate(opened, row.count),
    };
  });
  for (const row of openRows) {
    const k = key(row._id.type, row._id.slot);
    if (used.has(k)) continue;
    rows.push({
      type: String(row._id.type),
      slot: String(row._id.slot) === 'unknown' ? 'not recorded' : String(row._id.slot),
      sent: null,
      recipients: null,
      opened: row.count,
      open_rate: null,
    });
  }
  return rows;
}

export async function buildFrog(context: ReportContext): Promise<StatSection> {
  const [
    streakMix,
    notificationRows,
    openRows,
    hungerRows,
    reviewRows,
    goalRows,
    permissionRows,
    voiceSendRows,
    voiceOpenRows,
  ] = await Promise.all([
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
      { type: 'notification_type', slot: 'slot' },
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
    groupByProperties(
      { occurredAt: context.window, name: 'notification_permission_result' },
      { status: 'status', outcome: 'outcome' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'notification_sent' },
      { type: 'notification_type', variant: 'variant' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'notification_opened' },
      { type: 'notification_type', variant: 'variant' },
    ),
  ]);

  const checkIns = context.metric('streak_checked_in');
  const broken = context.metric('streak_broken');
  const shields = context.metric('streak_shield_used');
  const shieldPurchases = context.metric('shield_purchased');
  const hungerStarted = context.metric('hunger_started');
  const hungerResolved = context.metric('hunger_resolved');
  const sent = context.metric('notification_sent');

  const extended = streakMix
    .filter((row) => row._id.key === 'streak_tier' && row._id.value !== 'none')
    .reduce((sum, row) => sum + row.count, 0);

  const notSelfSet = (row: CountRow) => String(row._id.type) !== SELF_SET_REMINDER;
  const nudgesSent = notificationRows.filter(notSelfSet).reduce((sum, row) => sum + row.count, 0);
  const nudgesOpened = openRows.filter(notSelfSet).reduce((sum, row) => sum + row.count, 0);
  const permissionTotal = permissionRows.reduce((sum, row) => sum + row.count, 0);

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
      kpi('notification_open_rate', rate(nudgesOpened, nudgesSent), {
        detail: `${nudgesOpened} opens from ${nudgesSent} sends, not counting reminders people set on their own tasks`,
        sample: nudgesSent,
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
        rows: notificationTable(notificationRows, openRows),
        note: 'Only two notifications a day get through the cap, so a low open rate here is a slot being wasted. Opens before Nov 9, 2026 did not record the slot, so a message sent both morning and evening shows those opens on a separate "not recorded" row.',
      },
      {
        key: 'frog.notification_voice',
        title: 'Old vs new frog voice',
        question: 'Do pushes from the frog himself get opened more than the old style?',
        columns: [
          { key: 'variant', label: 'Style' },
          { key: 'sent', label: 'Sent', format: 'integer' },
          { key: 'opened', label: 'Opened', format: 'integer' },
          { key: 'open_rate', label: 'Open rate', format: 'percent' },
        ],
        rows: voiceTable(voiceSendRows, voiceOpenRows),
        note: 'Leaves out reminders people set on their own tasks. The new style started Nov 9, 2026, so pick a window that covers both sides of that date. Taps on an old-style push after the switch still count as old style.',
      },
      {
        key: 'frog.notification_permission',
        title: 'Reminder permission at onboarding',
        question: 'How many new users let the frog send reminders?',
        columns: [
          { key: 'status', label: 'Answer' },
          { key: 'outcome', label: 'Prompt' },
          { key: 'people', label: 'People', format: 'integer' },
          { key: 'share', label: 'Share of answers', format: 'percent' },
        ],
        rows: permissionRows
          .map((row) => ({
            status: PERMISSION_STATUS[String(row._id.status)] ?? String(row._id.status),
            outcome: PERMISSION_OUTCOME[String(row._id.outcome)] ?? String(row._id.outcome),
            people: row.users,
            share: rate(row.count, permissionTotal),
          }))
          .sort((a, b) => b.people - a.people),
        note: 'One row per answer on the "Get reminders" onboarding step. Tracked from Nov 9, 2026.',
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
