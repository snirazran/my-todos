'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { formatValue, integer } from './primitives';

type UserRow = Record<string, string | number>;

type UsersResponse = {
  range: { start: string; end: string; days: number };
  columns: Array<{ key: string; label: string }>;
  rows: UserRow[];
  total: number;
  page: number;
  limit: number;
};

const SEGMENTS = [
  { id: 'any', label: 'Everyone' },
  { id: 'new', label: 'New in range' },
  { id: 'engaged', label: 'Engaged (5+ active days)' },
  { id: 'dormant', label: 'Dormant (14+ days quiet)' },
  { id: 'paying', label: 'Plus' },
  { id: 'social', label: 'Has friends' },
];

const TIERS = [
  { id: 'any', label: 'Any tier' },
  { id: 'free', label: 'Free' },
  { id: 'plus', label: 'Plus' },
  { id: 'guest', label: 'Guest' },
];

const PLATFORMS = [
  { id: 'any', label: 'Any platform' },
  { id: 'web', label: 'Web' },
  { id: 'ios', label: 'iOS' },
  { id: 'android', label: 'Android' },
];

const NUMERIC = new Set([
  'active_days',
  'events',
  'tasks_created',
  'tasks_completed',
  'quest_claims',
  'focus_sessions',
  'purchases',
  'flies_earned',
  'flies_spent',
  'flies',
  'streak',
  'friends',
]);

export function UsersExplorer({ range }: { range: { start: string; end: string } }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [segment, setSegment] = useState('any');
  const [tier, setTier] = useState('any');
  const [platform, setPlatform] = useState('any');
  const [sort, setSort] = useState('last_seen');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, segment, tier, platform, sort, dir, range.start, range.end]);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      start: range.start,
      end: range.end,
      segment,
      tier,
      platform,
      sort,
      dir,
      page: String(page),
      limit: '50',
    });
    if (debounced) params.set('q', debounced);
    return params;
  }, [range.start, range.end, segment, tier, platform, sort, dir, page, debounced]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/statistics/users?${query.toString()}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Users could not be loaded');
        return response.json() as Promise<UsersResponse>;
      })
      .then(setData)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Users could not be loaded');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const csvQuery = new URLSearchParams(query);
  csvQuery.set('format', 'csv');
  csvQuery.delete('page');

  const columns = data?.columns ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs font-semibold outline-none focus:border-foreground"
            />
          </div>
          <Select value={segment} onChange={setSegment} options={SEGMENTS} label="Segment" />
          <Select value={tier} onChange={setTier} options={TIERS} label="Tier" />
          <Select value={platform} onChange={setPlatform} options={PLATFORMS} label="Platform" />
          <a
            href={`/api/admin/statistics/users?${csvQuery.toString()}`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          Per-user activity for {range.start} → {range.end}. Counts cover the selected range;
          balance, streak, and friend count are current values.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-border">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-2 font-bold text-muted-foreground ${
                      NUMERIC.has(column.key) ? 'text-right' : 'text-left'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (sort === column.key) setDir((value) => (value === 'asc' ? 'desc' : 'asc'));
                        else {
                          setSort(column.key);
                          setDir('desc');
                        }
                      }}
                      className="transition-colors hover:text-foreground"
                    >
                      {column.label}
                      {sort === column.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={columns.length || 1} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !data?.rows.length ? (
                <tr>
                  <td colSpan={columns.length || 1} className="px-3 py-8 text-center text-muted-foreground">
                    No users match these filters.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <tr
                    key={String(row.user_id)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                          NUMERIC.has(column.key) ? 'text-right' : 'text-left'
                        } ${index === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'} ${
                          column.key === 'user_id' ? 'font-mono text-[10px]' : ''
                        }`}
                      >
                        {NUMERIC.has(column.key)
                          ? formatValue(row[column.key], 'integer')
                          : String(row[column.key] ?? '—') || '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              {integer.format(data.total)} users match · page {data.page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-9 shrink-0 rounded-md border border-border bg-background px-2 text-xs font-bold outline-none focus:border-foreground"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
