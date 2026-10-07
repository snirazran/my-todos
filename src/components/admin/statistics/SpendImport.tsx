'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { SPEND_CHANNELS } from '@/lib/attribution/classify';
import { money } from './primitives';

type Preview = {
  level: 'campaign' | 'adGroup' | 'keyword';
  hasDate: boolean;
  dateRange: { start: string; end: string } | null;
  columns: Record<string, string>;
  warnings: string[];
  totals: { spend: number; impressions: number; taps: number; installs: number };
  rows: number;
  sample: Array<{ date?: string; campaign: string; adGroup?: string; keyword?: string; spend: number; taps: number; installs: number }>;
};

type ImportRow = {
  _id: string;
  channel: string;
  level: string;
  start: string;
  end: string;
  rows: number;
  spend: number;
  installs: number;
  taps: number;
  spread: boolean;
  label?: string;
  createdAt: string;
};

const LEVEL_TEXT = { campaign: 'Campaign level', adGroup: 'Ad group level', keyword: 'Keyword level' };

const CHANNEL_NAME = new Map<string, string>(SPEND_CHANNELS.map((channel) => [channel.id, channel.label]));

export function SpendImports({ onChanged, defaultRange }: { onChanged: () => void; defaultRange: { start: string; end: string } }) {
  const [imports, setImports] = useState<ImportRow[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch('/api/admin/statistics/spend', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { imports: [] }))
      .then((body: { imports: ImportRow[] }) => setImports(body.imports))
      .catch(() => setImports([]));
  }, []);

  useEffect(load, [load]);

  const remove = async (id: string) => {
    await fetch(`/api/admin/statistics/spend?batch=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    load();
    onChanged();
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Ad spend reports</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Import the report from Apple Ads (or Meta, TikTok) to turn installs into cost per account, cost per activated user, and ROAS.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-bold text-background hover:opacity-90"
        >
          <Upload className="h-3.5 w-3.5" />
          Import report
        </button>
      </header>
      {imports === null ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Loading…</p>
      ) : !imports.length ? (
        <div className="px-4 py-4 text-[13px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">No reports imported yet.</p>
          <p className="mt-1">
            In Apple Ads, open Campaigns, pick the date range, and use the download button to export a CSV. Import the
            Campaigns report first (it carries the true totals, including Search Match), then the Ad Groups and Keywords
            reports for drill-down. Turn on a day-by-day breakdown if you can — otherwise totals are spread evenly over
            the dates you pick.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Network</th>
                <th className="px-3 py-2 font-semibold">Level</th>
                <th className="px-3 py-2 font-semibold">Dates</th>
                <th className="px-3 py-2 text-right font-semibold">Spend</th>
                <th className="px-3 py-2 text-right font-semibold">Installs</th>
                <th className="px-3 py-2 font-semibold">Imported</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {imports.map((row) => (
                <tr key={row._id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-semibold">
                    {CHANNEL_NAME.get(row.channel) ?? row.channel}
                    {row.label ? <span className="ml-1.5 font-normal text-muted-foreground">{row.label}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{LEVEL_TEXT[row.level as keyof typeof LEVEL_TEXT] ?? row.level}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.start} → {row.end}
                    {row.spread ? <span className="ml-1 text-amber-600 dark:text-amber-400">(spread)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money.format(row.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(row.installs * 10) / 10}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(row._id)}
                      className="text-muted-foreground hover:text-red-600"
                      aria-label="Delete this import"
                      title="Delete this import"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
            A new import replaces earlier rows for the same network, level, and dates, so re-importing a longer range is safe.
          </p>
        </div>
      )}
      {open ? (
        <ImportDialog
          defaultRange={defaultRange}
          onClose={() => setOpen(false)}
          onImported={() => {
            setOpen(false);
            load();
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function ImportDialog({
  onClose,
  onImported,
  defaultRange,
}: {
  onClose: () => void;
  onImported: () => void;
  defaultRange: { start: string; end: string };
}) {
  const [channel, setChannel] = useState('apple_ads');
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [start, setStart] = useState(defaultRange.start);
  const [end, setEnd] = useState(defaultRange.end);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/statistics/spend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, text, label, start, end, preview: dryRun }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Import failed');
      if (dryRun) setPreview(body.preview as Preview);
      else onImported();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed');
      if (dryRun) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setPreview(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-bold">Import an ad spend report</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-semibold">Ad network</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 font-semibold"
              >
                {SPEND_CHANNELS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-semibold">Note (optional)</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Keywords, first week"
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Report (CSV file, or paste the table)</span>
              <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-[12px] font-semibold hover:bg-muted">
                Choose file
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(event) => onFile(event.target.files?.[0])}
                />
              </label>
            </div>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
              }}
              rows={8}
              placeholder={'Campaign Name,Ad Group Name,Keyword,Spend,Impressions,Taps,Installs (Total)\nFRG_Competitor,Pet Apps,study bunny,4.18,120,3,2'}
              className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[12px]"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              Needs a campaign column plus Spend (or Avg CPA / Avg CPT), and ideally Installs, Taps, Impressions, and a
              Day column. Ad group and keyword columns make it drill down.
            </p>
          </div>

          {preview ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-bold">
                {LEVEL_TEXT[preview.level]} · {preview.rows} rows · {money.format(preview.totals.spend)} spend ·{' '}
                {preview.totals.installs} installs · {preview.totals.taps} taps
              </p>
              <p className="text-[12px] text-muted-foreground">
                Columns found:{' '}
                {Object.entries(preview.columns)
                  .map(([field, column]) => `${field} ← "${column}"`)
                  .join(', ')}
              </p>
              {preview.hasDate && preview.dateRange ? (
                <p className="text-[12px]">
                  Daily rows from {preview.dateRange.start} to {preview.dateRange.end}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-semibold">No day column — which dates does this report cover?</span>
                  <input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className="h-8 rounded border border-border bg-background px-2" />
                  <span>→</span>
                  <input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className="h-8 rounded border border-border bg-background px-2" />
                </div>
              )}
              {preview.warnings.map((warning) => (
                <p key={warning} className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                  {warning}
                </p>
              ))}
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {preview.sample.map((row, index) => (
                      <tr key={index} className="border-t border-border/60">
                        <td className="py-1 pr-2 text-muted-foreground">{row.date ?? ''}</td>
                        <td className="py-1 pr-2 font-semibold">{row.campaign}</td>
                        <td className="py-1 pr-2">{row.adGroup ?? ''}</td>
                        <td className="py-1 pr-2">{row.keyword ?? ''}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money.format(row.spend)}</td>
                        <td className="py-1 text-right tabular-nums">{row.installs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? <p className="font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => send(true)}
            disabled={!text.trim() || busy}
            className="h-9 rounded-md border border-border px-3 text-[13px] font-bold hover:bg-muted disabled:opacity-50"
          >
            Check report
          </button>
          <button
            type="button"
            onClick={() => send(false)}
            disabled={!preview || busy}
            className="h-9 rounded-md bg-foreground px-3 text-[13px] font-bold text-background hover:opacity-90 disabled:opacity-50"
          >
            Import
          </button>
        </footer>
      </div>
    </div>
  );
}
