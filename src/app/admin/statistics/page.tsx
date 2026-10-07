'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Download, RefreshCw } from 'lucide-react';
import { AdminGuard } from '@/components/auth/AdminGuard';
import {
  METRIC_BY_KEY,
  statusForBand,
  type SignalLevel,
  type StatKpi,
  type StatisticsSnapshot,
} from '@/lib/analytics/catalog';
import {
  DataTable,
  KpiCard,
  LEVEL_STYLES,
  LineChart,
  Panel,
  integer,
  isProvisional,
} from '@/components/admin/statistics/primitives';
import { UsersExplorer } from '@/components/admin/statistics/UsersExplorer';
import { SummaryView } from '@/components/admin/statistics/SummaryView';
import { AcquisitionView } from '@/components/admin/statistics/AcquisitionView';
import { JourneyDrawer } from '@/components/admin/statistics/JourneyDrawer';

const QUICK_RANGES = [7, 14, 30, 90, 365];

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: string; label: string }> }> = [
  { title: 'Start here', items: [{ id: 'summary', label: 'Summary' }] },
  {
    title: 'Users',
    items: [
      { id: 'acquisition', label: 'Acquisition' },
      { id: 'people', label: 'People' },
      { id: 'growth', label: 'Retention & growth' },
      { id: 'money', label: 'Money' },
    ],
  },
  {
    title: 'Product',
    items: [
      { id: 'tasks', label: 'Tasks & planner' },
      { id: 'quests', label: 'Quests & Leaps' },
      { id: 'frog', label: 'Frog & streaks' },
      { id: 'wardrobe', label: 'Wardrobe & shop' },
      { id: 'social', label: 'Friends & buddies' },
      { id: 'economy', label: 'Fly economy' },
    ],
  },
  {
    title: 'Data',
    items: [
      { id: 'tracking', label: 'Data health' },
      { id: 'reference', label: 'Export & dictionary' },
    ],
  },
];

const VIEW_IDS = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)));

const EXPORTS = [
  { format: 'md', label: 'AI brief (Markdown)', hint: 'Summary, caveats, every section, and one row per new account. Paste into Claude or ChatGPT.' },
  { format: 'json', label: 'Full snapshot (JSON)', hint: 'Everything on this page, including the drill-down tree and metric definitions.' },
  { format: 'csv', label: 'Every number (tidy CSV)', hint: 'One row per number. Opens in Sheets or Excel.' },
  { format: 'events', label: 'Raw events (NDJSON)', hint: 'One event per line, for your own pipeline.' },
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

function readUrlState() {
  if (typeof window === 'undefined') return { view: 'summary', quick: 30, range: quickRange(30) };
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') ?? 'summary';
  const start = params.get('start');
  const end = params.get('end');
  const days = Number(params.get('days') ?? 30);
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { view: VIEW_IDS.has(view) ? view : 'summary', quick: 0, range: { start, end } };
  }
  const quick = QUICK_RANGES.includes(days) ? days : 30;
  return { view: VIEW_IDS.has(view) ? view : 'summary', quick, range: quickRange(quick) };
}

function levelFor(entry: StatKpi): SignalLevel {
  const definition = METRIC_BY_KEY.get(entry.metric);
  if (!definition?.band) return 'good';
  if (isProvisional(entry)) return 'unknown';
  return statusForBand(entry.value, definition.band);
}

export default function StatisticsPage() {
  return (
    <AdminGuard>
      <StatisticsPageContent />
    </AdminGuard>
  );
}

function StatisticsPageContent() {
  const [initial] = useState(readUrlState);
  const [quick, setQuick] = useState(initial.quick);
  const [range, setRange] = useState(initial.range);
  const [compare, setCompare] = useState(true);
  const [view, setView] = useState(initial.view);
  const [data, setData] = useState<StatisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [journeyUser, setJourneyUser] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', view);
    if (quick) params.set('days', String(quick));
    else {
      params.set('start', range.start);
      params.set('end', range.end);
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [view, quick, range]);

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
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const open = useCallback((next: string) => {
    setView(VIEW_IDS.has(next) ? next : 'summary');
    window.scrollTo({ top: 0 });
  }, []);

  const levels = useMemo(() => {
    const map = new Map<string, SignalLevel>();
    for (const section of data?.sections ?? []) {
      map.set(
        section.id,
        section.kpis.reduce<SignalLevel>((current, entry) => {
          const level = levelFor(entry);
          if (level === 'bad') return 'bad';
          if (level === 'watch' && current !== 'bad') return 'watch';
          return current;
        }, 'good'),
      );
    }
    return map;
  }, [data]);

  const activeSection = data?.sections.find((section) => section.id === view);

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <Link
            href="/admin"
            title="Back to admin"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">Statistics</h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {data
                ? `${data.meta.range.start} → ${data.meta.range.end} · ${data.meta.range.days} days · ${integer.format(data.meta.coverage.eventsInRange)} events · UTC`
                : 'Loading…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
              {QUICK_RANGES.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setQuick(days);
                    setRange(quickRange(days));
                  }}
                  className={`h-7 min-w-10 rounded px-2 text-[12px] font-bold transition-colors ${
                    quick === days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-semibold outline-none focus:border-foreground"
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
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-semibold outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => setCompare((value) => !value)}
              className={`h-8 rounded-md border px-2.5 text-[12px] font-bold transition-colors ${
                compare
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
              title="Compare against the previous period of the same length"
            >
              vs previous
            </button>
            <CopyForAi base={exportBase} />
            <ExportMenu base={exportBase} />
            <button
              type="button"
              title="Refresh"
              onClick={reload}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Statistics sections">
          {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => open(item.id)}
              className={`h-8 shrink-0 rounded-md px-2.5 text-[12px] font-bold transition-colors ${
                view === item.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-6 px-4 py-5 md:px-6">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-5" aria-label="Statistics sections">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/80">{group.title}</p>
                <ul className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const level = levels.get(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={view === item.id ? 'page' : undefined}
                          onClick={() => open(item.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors ${
                            view === item.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {level === 'bad' || level === 'watch' ? (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLES[level].dot}`} />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : loading && !data ? (
            <Skeleton />
          ) : data ? (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {view === 'summary' ? <SummaryView data={data} onOpen={open} /> : null}
              {view === 'acquisition' ? (
                <AcquisitionView data={data} range={range} onReload={reload} onOpenUser={setJourneyUser} />
              ) : null}
              {view === 'people' ? (
                <div className="space-y-4">
                  <header>
                    <h2 className="text-xl font-bold tracking-tight">People</h2>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      Search, filter, and sort individual accounts. Click anyone to see where they came from and every step they took.
                    </p>
                  </header>
                  <UsersExplorer range={range} onOpenUser={setJourneyUser} />
                </div>
              ) : null}
              {view === 'reference' ? <Reference data={data} base={exportBase} /> : null}
              {activeSection && view !== 'acquisition' ? (
                <SectionView section={activeSection} exportBase={exportBase} />
              ) : null}

              <footer className="mt-10 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">
                <p>
                  All dates are UTC. Retention only counts users old enough to have reached the day in question, so a
                  blank means &ldquo;not measurable yet&rdquo;, not zero.
                  {data.meta.coverage.firstEventAt
                    ? ` Tracking began ${data.meta.coverage.firstEventAt.slice(0, 10)}; events are kept for ${data.meta.coverage.retentionDays} days.`
                    : ''}
                </p>
                <p className="mt-1">
                  Generated {new Date(data.meta.generatedAt).toLocaleString()} · {data.meta.coverage.declaredEvents} event types declared.
                </p>
              </footer>
            </div>
          ) : null}
        </main>
      </div>

      <JourneyDrawer userId={journeyUser} onClose={() => setJourneyUser(null)} />
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
        <h2 className="text-xl font-bold tracking-tight">{section.id === 'tracking' ? 'Data health' : section.title}</h2>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">{section.question}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground/80">{section.blurb}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {section.kpis.map((entry) => (
          <KpiCard key={entry.metric} entry={entry} definition={METRIC_BY_KEY.get(entry.metric)} level={levelFor(entry)} />
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

function Reference({ data, base }: { data: StatisticsSnapshot; base: string }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold tracking-tight">Export & dictionary</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Take the data elsewhere, and look up exactly what each number means.
        </p>
      </header>

      <Panel title="Exports" subtitle="Four shapes of the same data, for four different jobs.">
        <ul className="space-y-3 text-[13px]">
          {EXPORTS.map((item) => (
            <li key={item.format} className="flex flex-wrap items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="font-bold">{item.label}. </span>
                <span className="text-muted-foreground">{item.hint}</span>
              </span>
              <a
                href={`/api/admin/statistics/export?${base}&format=${item.format}`}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-bold hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          For an AI model, use <span className="font-semibold text-foreground">Copy for AI</span> in the header (or the
          Markdown download). It starts with the plain-words summary and the data caveats, carries every metric&apos;s
          definition and healthy range, and lists each new account with its campaign, ad group, keyword, and what they
          did — so the model can answer &ldquo;which keyword brings users who stay&rdquo; without guessing.
        </p>
      </Panel>

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold">Metric dictionary</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Every metric on this page, with its definition and healthy range.</p>
        </header>
        <div className="divide-y divide-border/60">
          {data.glossary.map((definition) => (
            <div key={definition.key} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h4 className="text-[13px] font-bold">{definition.label}</h4>
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">{definition.key}</code>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{definition.system}</span>
                {definition.benchmark ? (
                  <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {definition.benchmark}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{definition.definition}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
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

function CopyForAi({ base }: { base: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  const copy = async () => {
    setState('busy');
    try {
      const response = await fetch(`/api/admin/statistics/export?${base}&format=md`, { credentials: 'include' });
      if (!response.ok) throw new Error('Export failed');
      await navigator.clipboard.writeText(await response.text());
      setState('done');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 2500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={state === 'busy'}
      title="Copy the AI brief (Markdown) to the clipboard, ready to paste into Claude or ChatGPT"
      className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : state === 'busy' ? 'Preparing…' : 'Copy for AI'}
    </button>
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
        className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-10 z-40 w-80 rounded-lg border border-border bg-card p-1.5 shadow-lg">
            {EXPORTS.map((item) => (
              <a
                key={item.format}
                href={`/api/admin/statistics/export?${base}&format=${item.format}`}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2.5 py-2 transition-colors hover:bg-muted"
              >
                <p className="text-[13px] font-bold">{item.label}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{item.hint}</p>
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
      <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
