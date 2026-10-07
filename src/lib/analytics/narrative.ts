import {
  METRIC_BY_KEY,
  statusForBand,
  type AcquisitionReport,
  type Signal,
  type StatKpi,
  type StatSection,
  type SummaryLine,
  type SummaryTone,
} from '@/lib/analytics/catalog';

const MIN_SAMPLE = 20;

function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function change(value: number | null, previous: number | null | undefined) {
  if (value === null || previous === null || previous === undefined) return '';
  if (previous === 0) return value > 0 ? `, up from 0 the period before` : '';
  const delta = Math.round(((value - previous) / previous) * 100);
  if (delta === 0) return ', flat on the period before';
  return `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% on the period before`;
}

function toneFor(entry: StatKpi | undefined): SummaryTone {
  if (!entry || entry.value === null) return 'neutral';
  if (entry.sample !== undefined && entry.sample < MIN_SAMPLE) return 'neutral';
  const definition = METRIC_BY_KEY.get(entry.metric);
  if (!definition?.band) return 'neutral';
  const level = statusForBand(entry.value, definition.band);
  return level === 'unknown' ? 'neutral' : level;
}

function bandText(metric: string) {
  const band = METRIC_BY_KEY.get(metric)?.band;
  if (!band) return '';
  if (band.min !== undefined) return ` (healthy: ${band.min}%+)`;
  if (band.max !== undefined) return ` (healthy: under ${band.max}%)`;
  return '';
}

function sampleNote(entry: StatKpi | undefined) {
  if (entry?.sample === undefined || entry.sample >= MIN_SAMPLE) return '';
  return ` — only ${plural(entry.sample, 'person', 'people')} so far, too few to judge`;
}

export function buildSummary(input: {
  sections: StatSection[];
  acquisition: AcquisitionReport;
  signals: Signal[];
  days: number;
}): SummaryLine[] {
  const { sections, acquisition, signals, days } = input;
  const kpis = new Map(sections.flatMap((section) => section.kpis.map((entry) => [entry.metric, entry])));
  const get = (key: string) => kpis.get(key);
  const lines: SummaryLine[] = [];

  const newUsers = get('new_users');
  const accounts = acquisition.coverage.accounts;
  lines.push({
    tone: 'neutral',
    view: 'acquisition',
    text: `${plural(accounts, 'new account')} in the last ${plural(days, 'day')}${change(newUsers?.value ?? null, newUsers?.previous)}.`,
  });

  const channels = acquisition.nodes
    .filter((node) => node.path.length === 1 && node.metrics.accounts > 0)
    .sort((a, b) => b.metrics.accounts - a.metrics.accounts);
  if (channels.length) {
    const top = channels
      .slice(0, 4)
      .map((node) => `${node.labels[0]} ${node.metrics.accounts}`)
      .join(' · ');
    const pending = acquisition.coverage.awaiting
      ? ` ${plural(acquisition.coverage.awaiting, 'native install is', 'native installs are')} still waiting for an ad match (RevenueCat can take up to 7 days).`
      : '';
    lines.push({ tone: 'neutral', view: 'acquisition', text: `Where they came from: ${top}.${pending}` });
  }

  const paidLeaves = acquisition.nodes
    .filter((node) => node.paid && node.path.length >= 2 && node.metrics.accounts > 0)
    .sort((a, b) => b.path.length - a.path.length || b.metrics.accounts - a.metrics.accounts);
  const deepest = paidLeaves.length ? paidLeaves[0].path.length : 0;
  const leaves = paidLeaves
    .filter((node) => node.path.length === deepest)
    .sort((a, b) => b.metrics.activated - a.metrics.activated || b.metrics.accounts - a.metrics.accounts)
    .slice(0, 3);
  if (leaves.length) {
    const described = leaves
      .map(
        (node) =>
          `${node.labels.slice(1).filter((label) => label !== '(not set)').join(' → ')} (${plural(node.metrics.accounts, 'account')}, ${node.metrics.activated} did a task)`,
      )
      .join('; ');
    lines.push({ tone: 'neutral', view: 'acquisition', text: `Ads that produced accounts: ${described}.` });
  }

  const paidAccounts = get('paid_accounts')?.value ?? 0;
  const spend = acquisition.coverage.spendInRange;
  if (spend > 0) {
    const perAccount = get('cost_per_account')?.value;
    const perActivated = get('cost_per_activated')?.value;
    const activatedCount = acquisition.nodes
      .filter((node) => node.paid && node.path.length === 1)
      .reduce((sum, node) => sum + node.metrics.activated, 0);
    lines.push({
      tone: 'neutral',
      view: 'acquisition',
      text: `${usd(spend)} spent on ads → ${plural(paidAccounts, 'account')}${perAccount ? ` (${usd(perAccount)} each)` : ''}, ${activatedCount} of them did a task${perActivated ? ` (${usd(perActivated)} per activated user)` : ''}.`,
    });
  } else if (paidAccounts > 0) {
    lines.push({
      tone: 'watch',
      view: 'acquisition',
      text: `${plural(paidAccounts, 'account')} came from ads, but no spend report is imported for these dates — import one to see cost per user.`,
    });
  }

  const known = get('attributed_share');
  if (known?.value !== null && known?.value !== undefined && accounts > 0 && toneFor(known) === 'bad') {
    lines.push({
      tone: 'bad',
      view: 'acquisition',
      text: `The source is unknown for ${Math.round(100 - known.value)}% of new accounts, so campaign numbers describe only part of the picture.`,
    });
  }

  const activation = get('activation_rate');
  if (activation?.value !== null && activation?.value !== undefined && accounts > 0) {
    lines.push({
      tone: toneFor(activation),
      view: 'growth',
      text: `${activation.value}% of new accounts completed a task${bandText('activation_rate')}${sampleNote(activation)}.`,
    });
  }

  const d1 = get('retention_d1');
  if (d1?.value !== null && d1?.value !== undefined) {
    lines.push({
      tone: toneFor(d1),
      view: 'growth',
      text: `${d1.value}% came back the day after signing up${bandText('retention_d1')}${sampleNote(d1)}.`,
    });
  }

  const d7 = get('retention_d7');
  if (d7?.value !== null && d7?.value !== undefined) {
    lines.push({
      tone: toneFor(d7),
      view: 'growth',
      text: `${d7.value}% were back on day 7${bandText('retention_d7')}${sampleNote(d7)}.`,
    });
  }

  const revenue = get('gross_revenue')?.value ?? 0;
  const trials = acquisition.funnel.find((step) => step.key === 'trials')?.users ?? 0;
  const paying = acquisition.funnel.find((step) => step.key === 'paid')?.users ?? 0;
  lines.push({
    tone: 'neutral',
    view: 'money',
    text:
      revenue > 0
        ? `${usd(revenue)} revenue in the range. New accounts started ${plural(trials, 'trial')}; ${paying} of them paid.`
        : `No revenue in the range. New accounts started ${plural(trials, 'trial')}.`,
  });

  const silent = signals.find((signal) => signal.key === 'tracking:silent');
  if (silent) {
    lines.push({
      tone: 'bad',
      view: 'tracking',
      text: `${silent.title} — check Data health before trusting a drop in any product number.`,
    });
  }

  return lines;
}
