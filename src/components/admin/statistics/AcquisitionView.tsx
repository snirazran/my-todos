'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  METRIC_BY_KEY,
  statusForBand,
  type AcquisitionMetrics,
  type AcquisitionNode,
  type SignalLevel,
  type StatKpi,
  type StatisticsSnapshot,
} from '@/lib/analytics/catalog';
import { DataTable, KpiCard, LineChart, Panel, decimal, integer, isProvisional, money } from './primitives';
import { SpendImports } from './SpendImport';

type Column = {
  key: string;
  label: string;
  hint: string;
  group: 'volume' | 'quality' | 'money' | 'cost';
  value: (metrics: AcquisitionMetrics) => number | null;
  render: (metrics: AcquisitionMetrics) => React.ReactNode;
};

function share(numerator: number, denominator: number) {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function Fraction({ numerator, denominator }: { numerator: number; denominator: number }) {
  if (!denominator) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold text-foreground">{Math.round((numerator / denominator) * 100)}%</span>
      <span className="text-[11px] text-muted-foreground">
        {numerator}/{denominator}
      </span>
    </span>
  );
}

function Money({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted-foreground/60">—</span>;
  return <span className="font-semibold text-foreground">{money.format(value)}</span>;
}

const COLUMNS: Column[] = [
  {
    key: 'accounts',
    label: 'Accounts',
    hint: 'New accounts created in the range.',
    group: 'volume',
    value: (m) => m.accounts,
    render: (m) => <span className="font-bold text-foreground">{integer.format(m.accounts)}</span>,
  },
  {
    key: 'onboarded',
    label: 'Onboarded',
    hint: 'Finished onboarding.',
    group: 'quality',
    value: (m) => share(m.onboarded, m.accounts),
    render: (m) => <Fraction numerator={m.onboarded} denominator={m.accounts} />,
  },
  {
    key: 'activated',
    label: 'Did a task',
    hint: 'Completed at least one task — the activation moment.',
    group: 'quality',
    value: (m) => share(m.activated, m.accounts),
    render: (m) => <Fraction numerator={m.activated} denominator={m.accounts} />,
  },
  {
    key: 'd1',
    label: 'Back D1',
    hint: 'Opened the app the day after signup. Only counts accounts at least a day old.',
    group: 'quality',
    value: (m) => share(m.d1Retained, m.d1Eligible),
    render: (m) => <Fraction numerator={m.d1Retained} denominator={m.d1Eligible} />,
  },
  {
    key: 'd7',
    label: 'Back D7',
    hint: 'Opened the app on day 7. Only counts accounts at least seven days old.',
    group: 'quality',
    value: (m) => share(m.d7Retained, m.d7Eligible),
    render: (m) => <Fraction numerator={m.d7Retained} denominator={m.d7Eligible} />,
  },
  {
    key: 'tasks',
    label: 'Tasks wk1',
    hint: 'Average tasks completed in the first seven days.',
    group: 'quality',
    value: (m) => (m.accounts ? m.tasksFirstWeek / m.accounts : null),
    render: (m) =>
      m.accounts ? (
        <span className="font-semibold text-foreground">{decimal.format(m.tasksFirstWeek / m.accounts)}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      ),
  },
  {
    key: 'trials',
    label: 'Trials',
    hint: 'Started a Plus trial.',
    group: 'money',
    value: (m) => m.trials,
    render: (m) => <span className={m.trials ? 'font-semibold text-foreground' : ''}>{m.trials}</span>,
  },
  {
    key: 'paid',
    label: 'Paid',
    hint: 'Paid at least once — subscription or fly pack.',
    group: 'money',
    value: (m) => m.paid,
    render: (m) => <span className={m.paid ? 'font-semibold text-foreground' : ''}>{m.paid}</span>,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    hint: 'Production revenue from these users, to date.',
    group: 'money',
    value: (m) => m.revenue,
    render: (m) => (m.revenue ? <Money value={m.revenue} /> : <span>$0</span>),
  },
];

const COST_COLUMNS: Column[] = [
  {
    key: 'spend',
    label: 'Spend',
    hint: 'From imported ad reports.',
    group: 'cost',
    value: (m) => m.spend,
    render: (m) => <Money value={m.spend || null} />,
  },
  {
    key: 'installs',
    label: 'Installs',
    hint: 'Installs reported by the ad network.',
    group: 'cost',
    value: (m) => m.installs,
    render: (m) =>
      m.installs ? <span>{decimal.format(Math.round(m.installs * 10) / 10)}</span> : <span className="text-muted-foreground/60">—</span>,
  },
  {
    key: 'install_to_account',
    label: 'Install→acct',
    hint: 'Accounts ÷ reported installs. The gap is people who quit during onboarding, or installs not matched yet.',
    group: 'cost',
    value: (m) => share(m.accounts, m.installs),
    render: (m) =>
      m.installs ? (
        <span className="font-semibold text-foreground">{Math.round((m.accounts / m.installs) * 100)}%</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      ),
  },
  {
    key: 'cpa',
    label: '$ / account',
    hint: 'Spend ÷ accounts.',
    group: 'cost',
    value: (m) => (m.spend && m.accounts ? m.spend / m.accounts : null),
    render: (m) => <Money value={m.spend && m.accounts ? m.spend / m.accounts : null} />,
  },
  {
    key: 'cp_activated',
    label: '$ / activated',
    hint: 'Spend ÷ accounts that completed a task. The number to optimise campaigns on.',
    group: 'cost',
    value: (m) => (m.spend && m.activated ? m.spend / m.activated : null),
    render: (m) => <Money value={m.spend && m.activated ? m.spend / m.activated : null} />,
  },
  {
    key: 'roas',
    label: 'ROAS',
    hint: 'Revenue to date ÷ spend. 1.0 = the ads paid for themselves.',
    group: 'cost',
    value: (m) => (m.spend ? m.revenue / m.spend : null),
    render: (m) =>
      m.spend ? <span className="font-semibold text-foreground">{decimal.format(m.revenue / m.spend)}×</span> : <span className="text-muted-foreground/60">—</span>,
  },
];

const GROUP_LABELS: Record<Column['group'], string> = {
  volume: '',
  quality: 'What they did',
  money: 'Money',
  cost: 'Cost',
};

function sumNodes(nodes: AcquisitionNode[]): AcquisitionMetrics {
  const total: AcquisitionMetrics = {
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
  for (const node of nodes) {
    for (const key of Object.keys(total) as Array<keyof AcquisitionMetrics>) {
      if (key === 'spendEstimated') total.spendEstimated ||= node.metrics.spendEstimated;
      else (total[key] as number) += node.metrics[key] as number;
    }
  }
  return total;
}

function levelFor(entry: StatKpi): SignalLevel {
  const definition = METRIC_BY_KEY.get(entry.metric);
  if (!definition?.band) return 'good';
  if (isProvisional(entry)) return 'unknown';
  return statusForBand(entry.value, definition.band);
}

export function AcquisitionView({
  data,
  range,
  onReload,
  onOpenUser,
}: {
  data: StatisticsSnapshot;
  range: { start: string; end: string };
  onReload: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const report = data.acquisition;
  const section = data.sections.find((entry) => entry.id === 'acquisition');
  const [path, setPath] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'accounts', dir: -1 });
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);

  const channel = path[0];
  const levelNames = channel ? report.levelNames[channel] ?? [] : [];
  const depth = path.length;
  const levelName = depth === 0 ? 'Channel' : levelNames[depth - 1];
  const parent = depth ? report.nodes.find((node) => node.path.join('\u0001') === path.join('\u0001')) : null;
  const children = report.nodes.filter(
    (node) => node.path.length === depth + 1 && path.every((key, index) => node.path[index] === key),
  );
  const canDrill = (node: AcquisitionNode) =>
    node.path.length < 1 + (report.levelNames[node.path[0]]?.length ?? 0);
  const showCost = depth === 0 ? report.coverage.spendImports > 0 : !!parent?.paid;
  const spendDepth = channel ? report.coverage.spendDepth[channel] ?? 0 : 1;
  const columns = showCost ? [...COLUMNS, ...COST_COLUMNS] : COLUMNS;
  const costUnknown = depth > 0 && depth > spendDepth;

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort.key) ?? columns[0];
    return [...children].sort((a, b) => {
      const left = column.value(a.metrics);
      const right = column.value(b.metrics);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * sort.dir || b.metrics.spend - a.metrics.spend;
    });
  }, [children, columns, sort]);

  const total = parent?.metrics ?? sumNodes(children);

  const peopleTable = section?.tables.find((table) => table.key === 'acquisition.people');
  const people = (peopleTable?.rows ?? []).filter((row) => {
    const rowPath = String(row.path ?? '').split('\u0001');
    return path.every((key, index) => rowPath[index] === key);
  });

  const series = section?.series[0];
  const referrers = section?.tables.find((table) => table.key === 'acquisition.referrers');
  const coverage = report.coverage;
  const knownShare = coverage.accounts ? Math.round((coverage.known / coverage.accounts) * 100) : null;

  const resolve = async () => {
    setResolving(true);
    setResolveNote(null);
    try {
      const response = await fetch('/api/admin/statistics/attribution', { method: 'POST', credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed');
      setResolveNote(
        `Processed ${body.backfilled} account${body.backfilled === 1 ? '' : 's'}, asked RevenueCat about ${body.checked}, matched ${body.resolved} to an ad.`,
      );
      onReload();
    } catch (reason) {
      setResolveNote(reason instanceof Error ? reason.message : 'Failed');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold tracking-tight">Acquisition</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Every new account carries its source. Drill from channel to campaign to ad group to keyword, and see what
          those people did next and what they cost.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-[13px]">
        <span>
          <span className="font-bold">Source known</span>{' '}
          <span className="tabular-nums">
            {coverage.known} of {coverage.accounts}
            {knownShare !== null ? ` (${knownShare}%)` : ''}
          </span>
        </span>
        {coverage.awaiting ? (
          <span className="text-amber-700 dark:text-amber-300" title="Native installs RevenueCat has not matched to an ad yet. Apple can take up to 24 hours; RevenueCat keeps checking for 7 days.">
            {coverage.awaiting} waiting for an ad match
          </span>
        ) : null}
        {coverage.direct ? <span className="text-muted-foreground">{coverage.direct} direct web</span> : null}
        {coverage.unprocessed ? (
          <span className="text-amber-700 dark:text-amber-300">{coverage.unprocessed} not processed yet</span>
        ) : null}
        {!coverage.revenueCatConfigured ? (
          <span className="font-semibold text-red-600 dark:text-red-400">
            REVENUECAT_SECRET_API_KEY is missing on this server — Apple Ads keywords cannot be read.
          </span>
        ) : null}
        <button
          type="button"
          onClick={resolve}
          disabled={resolving}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-bold hover:bg-muted disabled:opacity-50"
          title="Process new accounts and ask RevenueCat for Apple Ads matches now, instead of waiting for the 15-minute background run."
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resolving ? 'animate-spin' : ''}`} />
          Match sources now
        </button>
        {resolveNote ? <p className="w-full text-[12px] text-muted-foreground">{resolveNote}</p> : null}
      </section>

      {section ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {section.kpis.map((entry) => (
            <KpiCard key={entry.metric} entry={entry} definition={METRIC_BY_KEY.get(entry.metric)} level={levelFor(entry)} />
          ))}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <nav className="flex flex-wrap items-center gap-1 text-[13px]" aria-label="Drill-down path">
            <button
              type="button"
              onClick={() => setPath([])}
              className={`rounded px-1.5 py-0.5 font-bold ${depth === 0 ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              All channels
            </button>
            {path.map((key, index) => {
              const node = report.nodes.find((entry) => entry.path.join('\u0001') === path.slice(0, index + 1).join('\u0001'));
              return (
                <span key={key + index} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setPath(path.slice(0, index + 1))}
                    className={`rounded px-1.5 py-0.5 font-bold ${index === path.length - 1 ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  >
                    {node?.labels[index] ?? key}
                  </button>
                </span>
              );
            })}
          </nav>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {children.length
              ? `${children.length} ${levelName?.toLowerCase() ?? 'row'}${children.length === 1 ? '' : 's'}. Click a row to go one level deeper. Percentages show the raw count underneath — with a handful of users, read the count, not the percent.`
              : 'This is the most specific level for this source.'}
            {showCost && costUnknown ? ' Spend for this level has not been imported — import the matching report to fill the cost columns.' : ''}
          </p>
        </header>

        {children.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th />
                  {columns.map((column, index) => {
                    const first = index === 0 || columns[index - 1].group !== column.group;
                    return (
                      <th key={column.key} className={`px-3 pt-2 text-right font-bold ${first && column.group !== 'volume' ? 'border-l border-border' : ''}`}>
                        {first ? GROUP_LABELS[column.group] : ''}
                      </th>
                    );
                  })}
                </tr>
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th className="sticky left-0 bg-card px-4 py-2 text-left font-semibold">{levelName ?? 'Name'}</th>
                  {columns.map((column, index) => {
                    const first = index > 0 && columns[index - 1].group !== column.group;
                    return (
                      <th key={column.key} className={`px-3 py-2 text-right font-semibold ${first ? 'border-l border-border' : ''}`} title={column.hint}>
                        <button
                          type="button"
                          onClick={() =>
                            setSort((current) =>
                              current.key === column.key ? { key: column.key, dir: current.dir === 1 ? -1 : 1 } : { key: column.key, dir: -1 },
                            )
                          }
                          className="inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          {column.label}
                          {sort.key === column.key ? (
                            <ChevronDown className={`h-3 w-3 ${sort.dir === 1 ? 'rotate-180' : ''}`} />
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((node) => {
                  const drill = canDrill(node);
                  return (
                    <tr
                      key={node.path.join('\u0001')}
                      onClick={drill ? () => setPath(node.path) : undefined}
                      className={`border-b border-border/50 align-top ${drill ? 'cursor-pointer hover:bg-muted/40' : ''} ${node.metrics.accounts ? '' : 'opacity-60'}`}
                    >
                      <td className="sticky left-0 max-w-[260px] bg-card px-4 py-2">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{node.labels[node.labels.length - 1]}</span>
                          {drill ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                        </span>
                        {node.paid && depth === 0 ? (
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">paid</span>
                        ) : null}
                        {!node.metrics.accounts && node.metrics.spend ? (
                          <span className="block text-[11px] text-muted-foreground">spend, no accounts yet</span>
                        ) : null}
                      </td>
                      {columns.map((column, index) => {
                        const first = index > 0 && columns[index - 1].group !== column.group;
                        const hideCost = column.group === 'cost' && !node.paid;
                        return (
                          <td key={column.key} className={`px-3 py-2 text-right tabular-nums text-muted-foreground ${first ? 'border-l border-border' : ''}`}>
                            {hideCost ? <span className="text-muted-foreground/40">·</span> : column.render(node.metrics)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-muted/40 align-top font-semibold">
                  <td className="sticky left-0 bg-muted/40 px-4 py-2 text-[12px] uppercase tracking-wide text-muted-foreground">
                    {depth ? 'Total' : 'All new accounts'}
                  </td>
                  {columns.map((column, index) => {
                    const first = index > 0 && columns[index - 1].group !== column.group;
                    return (
                      <td key={column.key} className={`px-3 py-2 text-right tabular-nums text-muted-foreground ${first ? 'border-l border-border' : ''}`}>
                        {column.render(total)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold">
            People {depth ? `from ${parent?.labels.filter((label) => label !== '(not set)').join(' › ')}` : 'who signed up in this range'}
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {people.length} {people.length === 1 ? 'account' : 'accounts'}, newest first. Click one to see their whole journey.
          </p>
        </header>
        {people.length ? (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Signed up</th>
                  <th className="px-3 py-2 font-semibold">Platform</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Onboarded</th>
                  <th className="px-3 py-2 text-right font-semibold">Tasks wk1</th>
                  <th className="px-3 py-2 text-right font-semibold">Active days</th>
                  <th className="px-3 py-2 font-semibold">D1</th>
                  <th className="px-3 py-2 font-semibold">D7</th>
                  <th className="px-3 py-2 font-semibold">Paid</th>
                  <th className="px-3 py-2 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {people.map((row) => {
                  const source = [row.channel, row.campaign, row.ad_group, row.keyword]
                    .map((value) => String(value ?? ''))
                    .slice(depth)
                    .filter((value) => value && value !== '(not set)')
                    .join(' › ');
                  return (
                    <tr
                      key={String(row.user_id)}
                      onClick={() => onOpenUser(String(row.user_id))}
                      className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                    >
                      <td className="px-4 py-2 tabular-nums">{row.signed_up}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.platform}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 font-semibold">{source || String(row.channel)}</td>
                      <td className="px-3 py-2"><YesNo value={String(row.onboarded)} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.tasks_week1}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.active_days}</td>
                      <td className="px-3 py-2"><YesNo value={String(row.back_d1)} /></td>
                      <td className="px-3 py-2"><YesNo value={String(row.back_d7)} /></td>
                      <td className="px-3 py-2">
                        {row.paid === 'yes' ? (
                          <YesNo value="yes" />
                        ) : row.trial === 'yes' ? (
                          <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">trial</span>
                        ) : (
                          <YesNo value="no" />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.last_seen}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No accounts in this slice for the range.</p>
        )}
      </section>

      {series ? (
        <Panel title={series.title} subtitle={series.question}>
          <LineChart series={series} />
        </Panel>
      ) : null}

      {referrers ? <DataTable table={referrers} /> : null}

      <SpendImports onChanged={onReload} defaultRange={range} />
    </div>
  );
}

function YesNo({ value }: { value: string }) {
  if (value === 'yes') return <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-400">yes</span>;
  if (value === 'no') return <span className="text-[12px] text-muted-foreground">no</span>;
  return <span className="text-[12px] text-muted-foreground/60">{value}</span>;
}
