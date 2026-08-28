'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw, Users } from 'lucide-react';
import { AdminGuard } from '@/components/auth/AdminGuard';
import {
  METRIC_BY_KEY,
  statusForBand,
  type SignalLevel,
  type StatisticsSnapshot,
  type SystemId,
} from '@/lib/analytics/catalog';
import {
  DataTable,
  KpiCard,
  LEVEL_STYLES,
  LineChart,
  Panel,
  formatMetric,
  integer,
} from '@/components/admin/statistics/primitives';
import { UsersExplorer } from '@/components/admin/statistics/UsersExplorer';

type ViewId = SystemId | 'overview' | 'people' | 'reference';

const QUICK_RANGES = [7, 14, 30, 90, 365];

const EXPORTS = [
  { format: 'csv', label: 'Everything, tidy CSV', hint: 'One row per number. Opens in Sheets or Excel.' },
  { format: 'json', label: 'Full snapshot, JSON', hint: 'Metric definitions, bands, signals, every table.' },
  { format: 'md', label: 'AI brief, Markdown', hint: 'Self-describing report — paste straight into Claude.' },
  { format: 'events', label: 'Raw events, NDJSON', hint: 'One event per line, for your own pipeline.' },
];

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function quickRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: dateInput(start), end: dateInput(end) };
}

function spanDays(start: string, end: string) {
  const from = new Date(`${start}T00:00:00.000Z`).getTime();
  const to = new Date(`${end}T00:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

export default function StatisticsPage() {
  return (
    <AdminGuard>
      <StatisticsPageContent />
    </AdminGuard>
  );
}

function StatisticsPageContent() {
  const [quick, setQuick] = useState(30);
  const [range, setRange] = useState(() => quickRange(30));
  const [compare, setCompare] = useState(true);
  const [view, setView] = useState<ViewId>('overview');
  const [data, setData] = useState<StatisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const days = spanDays(range.start, range.end);
    if (days < 1 || days > 400) {
      setLoading(false);
      setError('Pick a range of 1 to 400 days, with From on or before To.');
      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    fetch(
      `/api/admin/statistics?start=${range.start}&end=${range.end}${compare ? '&compare=1' : ''}`,
      { credentials: 'include', signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error('Statistics could not be loaded');
        return response.json() as Promise<StatisticsSnapshot>;
      })
      .then(setData)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Statistics could not be loaded');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [range, compare, reloadKey]);

  const exportBase = `start=${range.start}&end=${range.end}${compare ? '&compare=1' : ''}`;

  const views = useMemo(() => {
    const sections = data?.sections ?? [];
    return [
      { id: 'overview' as ViewId, label: 'Overview' },
      ...sections.map((section) => ({ id: section.id as ViewId, label: section.title })),
      { id: 'people' as ViewId, label: 'People' },
      { id: 'reference' as ViewId, label: 'Reference' },
    ];
  }, [data]);

  const active = data?.sections.find((section) => section.id === view);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin"
              title="Back to admin"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">Statistics</h1>
              <p className="text-[11px] font-medium text-muted-foreground md:text-xs">
                {data
                  ? `${data.meta.range.start} → ${data.meta.range.end} · ${data.meta.range.days} days · ${integer.format(data.meta.coverage.eventsInRange)} events`
                  : 'Every system, one page'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ExportMenu base={exportBase} />
            <button
              type="button"
              title="Refresh"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 pb-3 md:flex-row md:items-center md:justify-between md:px-8">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Statistics sections">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => setView(item.id)}
                className={`h-8 shrink-0 rounded-md px-2.5 text-xs font-bold transition-colors ${
                  view === item.id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
              {QUICK_RANGES.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setQuick(days);
                    setRange(quickRange(days));
                  }}
                  className={`h-6 min-w-9 rounded px-1.5 text-[11px] font-bold transition-colors ${
                    quick === days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {days === 365 ? '1Y' : `${days}D`}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={range.start}
              max={range.end}
              onChange={(event) => {
                setQuick(0);
                setRange((current) => ({ ...current, start: event.target.value }));
              }}
              aria-label="Range start"
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-bold outline-none focus:border-foreground"
            />
            <input
              type="date"
              value={range.end}
              min={range.start}
              onChange={(event) => {
                setQuick(0);
                setRange((current) => ({ ...current, end: event.target.value }));
              }}
              aria-label="Range end"
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-bold outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => setCompare((value) => !value)}
              className={`h-8 rounded-md border px-2.5 text-[11px] font-bold transition-colors ${
                compare
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
              title="Compare against the previous period of the same length"
            >
              vs previous
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 md:px-8">
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : loading && !data ? (
          <Skeleton />
        ) : data ? (
          <>
            {view === 'overview' ? <Overview data={data} onOpen={setView} /> : null}
            {view === 'people' ? <UsersExplorer range={range} /> : null}
            {view === 'reference' ? <Reference data={data} /> : null}
            {active ? (
              <SectionView section={active} exportBase={exportBase} />
            ) : null}

            <footer className="mt-8 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                All dates are UTC. Retention cohorts only count users old enough to have reached the
                day in question, so a blank cell means "not yet measurable", not zero.
                {data.meta.coverage.firstEventAt
                  ? ` Tracking began ${new Date(data.meta.coverage.firstEventAt).toISOString().slice(0, 10)}; events are kept for ${data.meta.coverage.retentionDays} days.`
                  : ''}
              </p>
              <p className="mt-1">
                Generated {new Date(data.meta.generatedAt).toLocaleString()} ·{' '}
                {data.meta.coverage.declaredEvents} event types declared.
              </p>
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}

function levelFor(metricKey: string, value: number | null): SignalLevel {
  const definition = METRIC_BY_KEY.get(metricKey);
  if (!definition?.band) return 'good';
  return statusForBand(value, definition.band);
}

function Overview({
  data,
  onOpen,
}: {
  data: StatisticsSnapshot;
  onOpen: (view: ViewId) => void;
}) {
  const attention = data.signals.filter((signal) => signal.level === 'bad');
  const watch = data.signals.filter((signal) => signal.level === 'watch');

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-black tracking-tight">The six numbers</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {data.headline.map((entry) => (
            <KpiCard
              key={entry.metric}
              entry={entry}
              definition={METRIC_BY_KEY.get(entry.metric)}
              level={levelFor(entry.metric, entry.value)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-black tracking-tight">What needs a decision</h2>
          <p className="text-[11px] font-semibold text-muted-foreground">
            {attention.length} needing attention · {watch.length} to watch
          </p>
        </div>

        {!data.signals.length ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              Every metric with a defined healthy band is inside it.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing here means nothing is off. Read the sections for depth.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.signals.map((signal) => {
              const styles = LEVEL_STYLES[signal.level];
              return (
                <article
                  key={signal.key}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${styles.chip}`}>
                      {styles.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(signal.system)}
                      className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {signal.system}
                    </button>
                    <h3 className="text-sm font-black tracking-tight">{signal.title}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.detail}</p>
                  <p className="mt-2 border-l-2 border-foreground/20 pl-2.5 text-xs leading-relaxed">
                    <span className="font-bold">Do this. </span>
                    {signal.action}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black tracking-tight">Every system at a glance</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.sections.map((section) => {
            const worst = section.kpis.reduce<SignalLevel>((current, entry) => {
              const level = levelFor(entry.metric, entry.value);
              if (level === 'bad') return 'bad';
              if (level === 'watch' && current !== 'bad') return 'watch';
              return current;
            }, 'good');
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onOpen(section.id)}
                className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLES[worst].dot}`} />
                  <h3 className="text-sm font-black tracking-tight">{section.title}</h3>
                </div>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {section.question}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  {section.kpis.slice(0, 3).map((entry) => {
                    const definition = METRIC_BY_KEY.get(entry.metric);
                    return (
                      <div key={entry.metric}>
                        <dt className="truncate text-[10px] font-bold text-muted-foreground">
                          {definition?.label ?? entry.metric}
                        </dt>
                        <dd className="mt-0.5 text-sm font-black tabular-nums">
                          {formatMetric(entry.value, definition)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SectionView({
  section,
  exportBase,
}: {
  section: StatisticsSnapshot['sections'][number];
  exportBase: string;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-black tracking-tight">{section.title}</h2>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{section.question}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/80">{section.blurb}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {section.kpis.map((entry) => (
          <KpiCard
            key={entry.metric}
            entry={entry}
            definition={METRIC_BY_KEY.get(entry.metric)}
            level={levelFor(entry.metric, entry.value)}
          />
        ))}
      </div>

      {section.series.map((series) => (
        <Panel key={series.key} title={series.title} subtitle={series.question}>
          <LineChart series={series} />
        </Panel>
      ))}

      <div className="space-y-4">
        {section.tables.map((table) => (
          <DataTable
            key={table.key}
            table={table}
            exportHref={`/api/admin/statistics/export?${exportBase}&format=table&table=${encodeURIComponent(table.key)}`}
          />
        ))}
      </div>
    </div>
  );
}

function Reference({ data }: { data: StatisticsSnapshot }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-black tracking-tight">Reference</h2>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
          What each number means, how it is calculated, and what counts as healthy.
        </p>
      </header>

      <Panel
        title="Exports"
        subtitle="Four shapes of the same data, for four different jobs."
      >
        <ul className="space-y-2 text-xs">
          {EXPORTS.map((item) => (
            <li key={item.format} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>
                <span className="font-bold">{item.label}. </span>
                <span className="text-muted-foreground">{item.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The Markdown brief is the one to hand an AI model: it carries the metric definitions,
          healthy bands, and pre-computed signals alongside the numbers, so the model does not have
          to guess what &ldquo;stickiness&rdquo; or &ldquo;faucet&rdquo; means in this app.
        </p>
      </Panel>

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-black tracking-tight">Metric dictionary</h3>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            Every metric on this page, with its definition and band.
          </p>
        </header>
        <div className="divide-y divide-border/60">
          {data.glossary.map((definition) => (
            <div key={definition.key} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h4 className="text-xs font-black">{definition.label}</h4>
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {definition.key}
                </code>
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {definition.system}
                </span>
                {definition.benchmark ? (
                  <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {definition.benchmark}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {definition.definition}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Why: </span>
                {definition.why}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExportMenu({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-11 z-40 w-72 rounded-lg border border-border bg-card p-1.5 shadow-lg">
            {EXPORTS.map((item) => (
              <a
                key={item.format}
                href={`/api/admin/statistics/export?${base}&format=${item.format}`}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2.5 py-2 transition-colors hover:bg-muted"
              >
                <p className="text-xs font-bold">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{item.hint}</p>
              </a>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
