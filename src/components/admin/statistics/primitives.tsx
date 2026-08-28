'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Download, Info } from 'lucide-react';
import type {
  MetricDefinition,
  SignalLevel,
  StatColumn,
  StatFormat,
  StatKpi,
  StatSeries,
  StatTable,
} from '@/lib/analytics/catalog';

export const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export const LEVEL_STYLES: Record<SignalLevel, { dot: string; chip: string; label: string }> = {
  good: {
    dot: 'bg-emerald-500',
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    label: 'On track',
  },
  watch: {
    dot: 'bg-amber-500',
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    label: 'Watch',
  },
  bad: {
    dot: 'bg-red-500',
    chip: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    label: 'Needs attention',
  },
  unknown: {
    dot: 'bg-muted-foreground/40',
    chip: 'border-border bg-muted/40 text-muted-foreground',
    label: 'No data',
  },
};

export function formatValue(value: string | number | null | undefined, format?: StatFormat) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'percent':
      return `${decimal.format(value)}%`;
    case 'money':
      return money.format(value);
    case 'decimal':
    case 'ratio':
      return decimal.format(value);
    default:
      return integer.format(value);
  }
}

export function formatMetric(value: number | null | undefined, definition?: MetricDefinition) {
  if (value === null || value === undefined) return '—';
  if (!definition) return integer.format(value);
  return formatValue(value, definition.format);
}

export function Sparkline({ points, tone = 'currentColor' }: { points: number[]; tone?: string }) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const span = max - min || 1;
    const width = 100;
    const height = 28;
    return points
      .map((value, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  if (!path) return null;
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="h-7 w-full"
      role="img"
      aria-label="Trend over the selected range"
    >
      <path d={path} fill="none" stroke={tone} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Delta({ value, previous, direction }: {
  value: number | null;
  previous?: number | null;
  direction?: 'up' | 'down' | 'flat';
}) {
  if (value === null || previous === null || previous === undefined || previous === 0) return null;
  const change = ((value - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) return null;
  const rounded = Math.round(change * 10) / 10;
  const better = direction === 'down' ? rounded < 0 : rounded > 0;
  const neutral = direction === 'flat' || Math.abs(rounded) < 0.05;
  return (
    <span
      className={`text-[11px] font-bold tabular-nums ${
        neutral
          ? 'text-muted-foreground'
          : better
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
      }`}
    >
      {rounded > 0 ? '+' : ''}
      {decimal.format(rounded)}%
    </span>
  );
}

export const MIN_SAMPLE = 20;

export function isProvisional(entry: StatKpi) {
  return entry.sample !== undefined && entry.sample < MIN_SAMPLE;
}

export function KpiCard({
  entry,
  definition,
  level,
}: {
  entry: StatKpi;
  definition?: MetricDefinition;
  level: SignalLevel;
}) {
  const [open, setOpen] = useState(false);
  const provisional = isProvisional(entry);
  const styles = LEVEL_STYLES[provisional ? 'unknown' : level];
  const banded = !!definition?.band;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {definition?.label ?? entry.metric}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={`What ${definition?.label ?? entry.metric} means`}
          aria-expanded={open}
          className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums tracking-tight">
          {formatMetric(entry.value, definition)}
        </span>
        <Delta value={entry.value} previous={entry.previous} direction={definition?.direction} />
      </div>

      {entry.detail ? (
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{entry.detail}</p>
      ) : null}

      {provisional ? (
        <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          Only {entry.sample} observation{entry.sample === 1 ? '' : 's'} — too few to judge yet.
        </p>
      ) : null}

      {entry.sparkline && entry.sparkline.length > 1 ? (
        <div className="mt-3 text-muted-foreground/40">
          <Sparkline points={entry.sparkline} />
        </div>
      ) : null}

      {banded && !provisional ? (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
          <span className="text-[11px] font-semibold text-muted-foreground">
            {definition?.benchmark ??
              (definition?.band?.min !== undefined && definition?.band?.max !== undefined
                ? `Target ${definition.band.min} – ${definition.band.max}`
                : definition?.band?.min !== undefined
                  ? `Target ≥ ${definition.band.min}`
                  : `Target ≤ ${definition?.band?.max}`)}
          </span>
        </div>
      ) : null}

      {open && definition ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">How it is measured. </span>
            {definition.definition}
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">Why it matters. </span>
            {definition.why}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/70">{definition.key}</p>
        </div>
      ) : null}
    </div>
  );
}

export function LineChart({ series }: { series: StatSeries }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899'];

  const visible = series.lines.filter((line) => !hidden.has(line.key));
  const max = Math.max(
    1,
    ...series.points.flatMap((point) =>
      visible.map((line) => Number(point[line.key] ?? 0)),
    ),
  );

  const width = 640;
  const height = 180;
  const step = series.points.length > 1 ? width / (series.points.length - 1) : width;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {series.lines.map((line, index) => {
          const isHidden = hidden.has(line.key);
          return (
            <button
              key={line.key}
              type="button"
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(line.key)) next.delete(line.key);
                  else next.add(line.key);
                  return next;
                })
              }
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
                isHidden
                  ? 'border-border text-muted-foreground/50'
                  : 'border-border bg-muted/40 text-foreground'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isHidden ? 'currentColor' : colors[index % colors.length] }}
              />
              {line.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-44 w-full min-w-[420px]"
          role="img"
          aria-label={series.title}
        >
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={width}
              y1={height * fraction}
              y2={height * fraction}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-border"
            />
          ))}
          {series.lines.map((line, index) => {
            if (hidden.has(line.key)) return null;
            const path = series.points
              .map((point, pointIndex) => {
                const x = pointIndex * step;
                const y = height - (Number(point[line.key] ?? 0) / max) * (height - 8);
                return `${pointIndex === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(' ');
            return (
              <path
                key={line.key}
                d={path}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
        <span>{series.points[0]?.date ?? ''}</span>
        <span className="tabular-nums">peak {integer.format(max)}</span>
        <span>{series.points[series.points.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

function sortRows(
  rows: StatTable['rows'],
  key: string | null,
  direction: 1 | -1,
) {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction;
    }
    return String(left).localeCompare(String(right)) * direction;
  });
}

export function DataTable({
  table,
  exportHref,
  initialRows = 12,
}: {
  table: StatTable;
  exportHref?: string;
  initialRows?: number;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState(false);

  const sorted = sortRows(table.rows, sortKey, direction);
  const visible = expanded ? sorted : sorted.slice(0, initialRows);

  const align = (column: StatColumn) =>
    column.format && column.format !== 'text' ? 'text-right' : 'text-left';

  if (!table.rows.length) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-black tracking-tight">{table.title}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{table.question}</p>
        </header>
        <p className="px-4 py-6 text-center text-xs font-semibold text-muted-foreground">
          No data in this range yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-tight">{table.title}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{table.question}</p>
        </div>
        {exportHref ? (
          <a
            href={exportHref}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={`Download ${table.title} as CSV`}
          >
            <Download className="h-3 w-3" />
            CSV
          </a>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-border">
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-3 py-2 font-bold text-muted-foreground ${align(column)}`}
                  title={column.hint}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === column.key) setDirection((value) => (value === 1 ? -1 : 1));
                      else {
                        setSortKey(column.key);
                        setDirection(-1);
                      }
                    }}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${direction === 1 ? 'rotate-180' : ''}`}
                      />
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={index}
                className="border-b border-border/50 last:border-0 hover:bg-muted/30"
              >
                {table.columns.map((column, columnIndex) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 tabular-nums ${align(column)} ${
                      columnIndex === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {column.key === 'status' ? (
                      <StatusPill value={String(row[column.key] ?? '')} />
                    ) : (
                      formatValue(row[column.key], column.format)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.rows.length > initialRows ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full border-t border-border px-4 py-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? 'Show less' : `Show all ${table.rows.length} rows`}
        </button>
      ) : null}

      {table.note ? (
        <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {table.note}
        </p>
      ) : null}
    </section>
  );
}

const STATUS_TONES: Record<string, string> = {
  healthy: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  watch: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  quiet: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  silent: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  bad: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  never: 'border-border bg-muted/50 text-muted-foreground',
  unknown: 'border-border bg-muted/50 text-muted-foreground',
};

export function StatusPill({ value }: { value: string }) {
  const tone = STATUS_TONES[value] ?? 'border-border bg-muted/50 text-muted-foreground';
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>
      {value}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-tight">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
