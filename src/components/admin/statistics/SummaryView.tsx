'use client';

import { ArrowRight } from 'lucide-react';
import {
  METRIC_BY_KEY,
  statusForBand,
  type SignalLevel,
  type StatKpi,
  type StatisticsSnapshot,
} from '@/lib/analytics/catalog';
import { BarList, FunnelBars, KpiCard, LEVEL_STYLES, TONE_DOT, formatMetric, isProvisional } from './primitives';

function levelFor(entry: StatKpi): SignalLevel {
  const definition = METRIC_BY_KEY.get(entry.metric);
  if (!definition?.band) return 'good';
  if (isProvisional(entry)) return 'unknown';
  return statusForBand(entry.value, definition.band);
}

export function SummaryView({
  data,
  onOpen,
}: {
  data: StatisticsSnapshot;
  onOpen: (view: string) => void;
}) {
  const channels = data.acquisition.nodes
    .filter((node) => node.path.length === 1 && node.metrics.accounts > 0)
    .sort((a, b) => b.metrics.accounts - a.metrics.accounts);
  const attention = data.signals.filter((signal) => signal.level === 'bad' || signal.level === 'watch');

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-bold">In plain words</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {data.meta.range.start} → {data.meta.range.end}. Green and red only appear where a healthy range exists and
          enough people are behind the number.
        </p>
        <ul className="mt-4 space-y-2.5">
          {data.summary.map((line, index) => (
            <li key={index} className="flex items-start gap-3 text-[15px] leading-relaxed">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[line.tone]}`} />
              <span className="min-w-0 flex-1">{line.text}</span>
              {line.view ? (
                <button
                  type="button"
                  onClick={() => onOpen(line.view as string)}
                  className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Open the details"
                  title="Open the details"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">Key numbers</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {data.headline.map((entry) => (
            <KpiCard key={entry.metric} entry={entry} definition={METRIC_BY_KEY.get(entry.metric)} level={levelFor(entry)} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">What new accounts did</h2>
            <button type="button" onClick={() => onOpen('growth')} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">
              Retention →
            </button>
          </div>
          <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
            Everyone who signed up in the range, followed forward. Where the bar drops most is the step to fix first.
          </p>
          {data.acquisition.funnel.length && data.acquisition.coverage.accounts ? (
            <FunnelBars steps={data.acquisition.funnel} />
          ) : (
            <p className="text-[13px] text-muted-foreground">No new accounts in this range.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">Where they came from</h2>
            <button type="button" onClick={() => onOpen('acquisition')} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">
              Campaigns & keywords →
            </button>
          </div>
          <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
            New accounts by source, with how many of them completed a task.
          </p>
          {channels.length ? (
            <BarList
              rows={channels.map((node) => ({
                key: node.path[0],
                label: node.labels[0],
                value: node.metrics.accounts,
                detail: `${node.metrics.activated} did a task`,
              }))}
              onSelect={() => onOpen('acquisition')}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">No new accounts in this range.</p>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold">What needs a decision</h2>
          <p className="text-[12px] font-semibold text-muted-foreground">
            {attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'}` : 'Nothing out of range'}
          </p>
        </div>
        {attention.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {attention.map((signal) => {
              const styles = LEVEL_STYLES[signal.level];
              return (
                <article key={signal.key} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${styles.chip}`}>{styles.label}</span>
                    <button
                      type="button"
                      onClick={() => onOpen(signal.system)}
                      className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {signal.system}
                    </button>
                  </div>
                  <h3 className="mt-2 text-sm font-bold">{signal.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{signal.detail}</p>
                  <p className="mt-2 border-l-2 border-foreground/20 pl-2.5 text-[13px] leading-relaxed">
                    <span className="font-bold">Do this. </span>
                    {signal.action}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
            Every metric with a healthy range and enough data is inside it.
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">Every area at a glance</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.sections.map((section) => {
            const worst = section.kpis.reduce<SignalLevel>((current, entry) => {
              const level = levelFor(entry);
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
                  <h3 className="text-sm font-bold">{section.title}</h3>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">{section.question}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  {section.kpis.slice(0, 3).map((entry) => {
                    const definition = METRIC_BY_KEY.get(entry.metric);
                    return (
                      <div key={entry.metric}>
                        <dt className="truncate text-[11px] font-semibold text-muted-foreground">{definition?.label ?? entry.metric}</dt>
                        <dd className="mt-0.5 text-sm font-bold tabular-nums">{formatMetric(entry.value, definition)}</dd>
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
