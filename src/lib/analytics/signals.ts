import {
  METRIC_BY_KEY,
  statusForBand,
  type Signal,
  type SignalLevel,
  type StatSection,
} from '@/lib/analytics/catalog';

const LEVEL_ORDER: Record<SignalLevel, number> = { bad: 0, watch: 1, unknown: 2, good: 3 };

/**
 * A rate off fewer observations than this is noise, and calling it a failure
 * would have the dashboard crying wolf through the whole launch week. Metrics
 * under the floor are reported without a verdict instead.
 */
const MIN_SAMPLE = 20;

/**
 * `events_silent` gets its own richer signal built from the tracking table, so
 * the generic band check would only repeat it.
 */
const SKIP_BAND_CHECK = new Set(['events_silent']);

function bandText(band: { min?: number; max?: number } | undefined, unit: string) {
  if (!band) return '';
  const suffix = unit === 'percent' ? '%' : '';
  if (band.min !== undefined && band.max !== undefined) {
    return `${band.min}${suffix} – ${band.max}${suffix}`;
  }
  if (band.min !== undefined) return `at least ${band.min}${suffix}`;
  if (band.max !== undefined) return `at most ${band.max}${suffix}`;
  return '';
}

function actionFor(metricKey: string, level: SignalLevel): string {
  const actions: Record<string, string> = {
    stickiness: 'Look at the notification ladder and the login streak — those are the two levers that pull people back on a day they were not planning to open the app.',
    activation_rate: 'Replay onboarding on a fresh account. The starter plan and the first task completion are the two steps that carry this number.',
    retention_d1: 'The first session is the problem, not the app. Check onboarding drop-off and whether day one ends with a visible reward.',
    retention_d7: 'Week one is where the habit either forms or does not. Check the login streak, daily quests, and whether reminders are landing.',
    retention_d30: 'Long-run retention follows content depth. Check season progress and whether there is anything left to earn by day 30.',
    task_completion_rate: 'People are writing more than they finish. Consider smaller default plans, or surfacing overdue work less aggressively.',
    task_reopen_rate: 'Either the completion tap is too easy to hit by accident, or people are farming the reward. Check the undo refund path.',
    focus_completion_rate: 'Sessions are being abandoned. The default focus length is the first thing to try shortening.',
    quest_reach: 'Most active users are not touching quests. Check the quest card on home and whether the daily slot is visible without a tab switch.',
    quest_swap_rate: 'The generated daily is landing on the wrong thing. Review the recipe weights and the tag-to-area mapping.',
    pact_completion_rate: 'Committed Leaps are not finishing. The weekly target is probably set above what a normal week allows.',
    pact_drop_rate: 'Too many Leaps are being abandoned. Lower the default session count or make mid-week changes easier.',
    streak_extended_rate: 'Streaks keep resetting. Check freeze availability and whether the evening reminder is reaching people before midnight.',
    hunger_recovery_rate: 'Hungry frogs are not being fed. If people cannot recover, hunger is a punishment rather than a nudge.',
    notification_open_rate: 'The copy in the priority ladder is being ignored. Rewrite the lowest-performing message before adding another.',
    shop_reach: 'Flies are being earned and not spent. Check prices against the current income rate and whether the shop is easy to reach.',
    invite_conversion: 'Invites are being sent and not claimed. Walk the claim link end to end on a signed-out device.',
    buddy_acceptance_rate: 'Buddy invites are being declined or ignored. The ask may be too large, or the invite may not explain itself.',
    friend_request_acceptance: 'Requests are not being accepted. Check whether people can tell who is asking.',
    sink_faucet_ratio: 'The economy is inflating. Add a sink before cutting a faucet — cutting income is felt immediately, a new sink is not.',
    flies_per_dau: 'Per-player income has drifted off the rate every price in the catalog was set against. Find the faucet that moved.',
    median_balance_days: 'People are sitting on flies with nothing to buy. Add stock or lower prices before adding another faucet.',
    breaker_trips: 'Someone reached the daily hard cap. No legitimate user does. Investigate the user and the source.',
    paywall_conversion: 'The paywall is being seen and not converting. Check the step drop-off table to find which screen loses people.',
    plus_share: 'Subscription base is thin. Add value to the Plus season track rather than to the fly multiplier.',
    subscription_churn: 'Subscribers are leaving faster than they arrive. Check billing issues and the cancellation reasons.',
    ad_completion_rate: 'Requests are not reaching a reward. That is usually fill or a broken placement, not user choice.',
    events_silent: 'One or more systems stopped reporting. Check the tracking table below and the most recent deploy.',
  };
  return (
    actions[metricKey] ??
    (level === 'bad'
      ? 'Open the section below and read the breakdown tables to find which slice moved.'
      : 'Worth watching. Check again after the next release.')
  );
}

export function buildSignals(sections: StatSection[]): Signal[] {
  const signals: Signal[] = [];

  for (const section of sections) {
    for (const entry of section.kpis) {
      const definition = METRIC_BY_KEY.get(entry.metric);
      if (!definition?.band) continue;
      if (SKIP_BAND_CHECK.has(entry.metric)) continue;
      if (entry.value === null || !Number.isFinite(entry.value)) continue;
      // No observations at all is not a failing metric, it is an absent one.
      if (entry.sample !== undefined && entry.sample < MIN_SAMPLE) continue;

      const level = statusForBand(entry.value, definition.band);
      if (level === 'unknown' || level === 'good') continue;

      const suffix = definition.unit === 'percent' ? '%' : '';
      const target = bandText(definition.band, definition.unit);
      const delta =
        entry.previous !== null && entry.previous !== undefined && entry.previous !== 0
          ? ` It was ${entry.previous}${suffix} in the previous period.`
          : '';

      signals.push({
        key: `metric:${definition.key}`,
        level,
        system: definition.system,
        title: `${definition.label} is ${entry.value}${suffix}`,
        detail: `${definition.why} Target: ${target}.${delta}${
          entry.sample !== undefined ? ` Measured over ${entry.sample} observations.` : ''
        }`,
        action: actionFor(definition.key, level),
        metric: definition.key,
        value: entry.value,
      });
    }
  }

  const tracking = sections.find((section) => section.id === 'tracking');
  const trackingTable = tracking?.tables.find((table) => table.key === 'tracking.events');
  if (trackingTable) {
    const silent = trackingTable.rows.filter((row) => row.status === 'silent');
    const unwired = trackingTable.rows.filter((row) => row.status === 'unwired');
    if (silent.length) {
      signals.push({
        key: 'tracking:silent',
        level: 'bad',
        system: 'tracking',
        title: `${silent.length} event${silent.length === 1 ? '' : 's'} stopped reporting`,
        detail: `These fired before and wrote nothing in this range: ${silent
          .slice(0, 8)
          .map((row) => `${row.event} (${row.emitted_from})`)
          .join(', ')}${silent.length > 8 ? '…' : ''}.`,
        action:
          'Usually a regression in a recent deploy. The "Emitted from" column names the file to check. A low-traffic event can also go quiet simply because nobody did it — compare the all-time count first.',
      });
    }
    if (unwired.length) {
      signals.push({
        key: 'tracking:unwired',
        level: 'bad',
        system: 'tracking',
        title: `${unwired.length} declared event${unwired.length === 1 ? '' : 's'} have no emit site`,
        detail: `Declared in the taxonomy but nothing in the codebase writes them: ${unwired
          .slice(0, 8)
          .map((row) => row.event)
          .join(', ')}${unwired.length > 8 ? '…' : ''}.`,
        action:
          'Either wire the emit site or delete the declaration. Run `node scripts/generate-analytics-manifest.mjs` after either, so this check stays accurate.',
      });
    }
  }

  const economy = sections.find((section) => section.id === 'economy');
  const healthTable = economy?.tables.find((table) => table.key === 'economy.health');
  for (const row of healthTable?.rows ?? []) {
    if (row.status !== 'bad' && row.status !== 'watch') continue;
    if (signals.some((signal) => signal.title.startsWith(String(row.metric)))) continue;
    signals.push({
      key: `economy:${row.metric}`,
      level: row.status as SignalLevel,
      system: 'economy',
      title: `${row.metric} is ${row.value ?? 'unknown'}`,
      detail: `Target band: ${row.target}.`,
      action: String(row.hint || 'Open the economy section and read the faucet drift column.'),
    });
  }

  const seen = new Set<string>();
  return signals
    .filter((signal) => {
      if (seen.has(signal.key)) return false;
      seen.add(signal.key);
      return true;
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.title.localeCompare(b.title));
}
