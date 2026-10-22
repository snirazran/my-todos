'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, CheckCircle, XCircle, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type PityKey = 'softPityLuck' | 'softPityBonusPoints' | 'hardPityLuck' | 'epicPityLuck';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const PITY_FIELDS: Array<{ key: PityKey; label: string }> = [
  { key: 'softPityLuck', label: 'Soft at' },
  { key: 'softPityBonusPoints', label: 'Step' },
  { key: 'hardPityLuck', label: 'Hard at' },
  { key: 'epicPityLuck', label: 'Epic at' },
];

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-emerald-700 dark:text-emerald-400',
  rare: 'text-sky-700 dark:text-sky-400',
  epic: 'text-violet-700 dark:text-violet-400',
  legendary: 'text-amber-700 dark:text-amber-400',
};

type PriceStats = {
  rarity: Rarity;
  count: number;
  min: number | null;
  max: number | null;
  typical: number | null;
  tradeOnly: boolean;
};

type Change = { key: string; label: string; from: string; to: string; count?: number };

type EconomyState = {
  current: {
    pity: Record<PityKey, number>;
    cleanSweepFlies: number;
    dailySlotFlies: Array<number | null>;
    itemPrices: PriceStats[];
    backgroundPrices: PriceStats[];
  };
  recommended: {
    pity: Record<PityKey, number>;
    dailySlotFlies: number[];
    cleanSweepFlies: number;
    itemPrices: Partial<Record<Rarity, number>>;
    backgroundPrices: Partial<Record<Rarity, number>>;
  };
  lastUpdate: { id: string; at: string; changes: Change[] } | null;
};

type PriceInputs = Record<Rarity, string>;

const blankPrices = (): PriceInputs => ({ common: '', uncommon: '', rare: '', epic: '', legendary: '' });

const pricesFrom = (values: Partial<Record<Rarity, number>>): PriceInputs => {
  const out = blankPrices();
  RARITIES.forEach((rarity) => {
    if (typeof values[rarity] === 'number') out[rarity] = String(values[rarity]);
  });
  return out;
};

const fmt = (n: number) => n.toLocaleString('en-US');

const nowText = (stats?: PriceStats) => {
  if (!stats) return '';
  if (stats.tradeOnly) return 'Trade-only';
  if (stats.count === 0 || stats.min === null || stats.max === null) return 'None for sale';
  const range = stats.min === stats.max ? fmt(stats.min) : `${fmt(stats.min)}–${fmt(stats.max)}`;
  return `Now ${range} · ${stats.count}`;
};

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50';

async function post(body: unknown) {
  const res = await fetch('/api/admin/economy-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function EconomyUpdatePanel({ onApplied }: { onApplied?: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EconomyState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemPrices, setItemPrices] = useState<PriceInputs>(blankPrices);
  const [backgroundPrices, setBackgroundPrices] = useState<PriceInputs>(blankPrices);
  const [usePity, setUsePity] = useState(true);
  const [pity, setPity] = useState<Record<PityKey, string>>({
    softPityLuck: '',
    softPityBonusPoints: '',
    hardPityLuck: '',
    epicPityLuck: '',
  });
  const [useDaily, setUseDaily] = useState(true);
  const [daily, setDaily] = useState<string[]>(['', '', '']);
  const [useSweep, setUseSweep] = useState(true);
  const [sweep, setSweep] = useState('');
  const [preview, setPreview] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | 'undo' | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fillRecommended = useCallback((recommended: EconomyState['recommended']) => {
    setItemPrices(pricesFrom(recommended.itemPrices));
    setBackgroundPrices(pricesFrom(recommended.backgroundPrices));
    setPity({
      softPityLuck: String(recommended.pity.softPityLuck),
      softPityBonusPoints: String(recommended.pity.softPityBonusPoints),
      hardPityLuck: String(recommended.pity.hardPityLuck),
      epicPityLuck: String(recommended.pity.epicPityLuck),
    });
    setDaily(recommended.dailySlotFlies.map(String));
    setSweep(String(recommended.cleanSweepFlies));
    setUsePity(true);
    setUseDaily(true);
    setUseSweep(true);
    setPreview(null);
  }, []);

  const load = useCallback(async (prefill: boolean) => {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/economy-update', { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the current settings');
      setState(data as EconomyState);
      if (prefill) fillRecommended((data as EconomyState).recommended);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the current settings');
    }
  }, [fillRecommended]);

  useEffect(() => {
    if (open && !state) void load(true);
  }, [open, state, load]);

  const edited = () => {
    setPreview(null);
    setResult(null);
  };

  const buildInput = () => ({
    pity: usePity
      ? Object.fromEntries(PITY_FIELDS.map(({ key }) => [key, pity[key]]))
      : null,
    dailySlotFlies: useDaily ? daily : null,
    cleanSweepFlies: useSweep ? sweep : null,
    itemPrices,
    backgroundPrices,
  });

  const runPreview = async () => {
    setBusy('preview');
    setResult(null);
    try {
      const data = await post({ action: 'preview', input: buildInput() });
      setPreview(data.changes ?? []);
    } catch (error) {
      setResult({ type: 'error', message: error instanceof Error ? error.message : 'Preview failed' });
    } finally {
      setBusy(null);
    }
  };

  const runApply = async () => {
    setBusy('apply');
    setResult(null);
    try {
      const data = await post({ action: 'apply', input: buildInput() });
      const count = (data.changes ?? []).length;
      setResult({
        type: 'success',
        message: data.applied
          ? `Applied ${count} ${count === 1 ? 'change' : 'changes'}. You can undo it below.`
          : 'Nothing changed. Everything already matches.',
      });
      setPreview(null);
      await load(false);
      onApplied?.();
    } catch (error) {
      setResult({ type: 'error', message: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      setBusy(null);
    }
  };

  const runUndo = async () => {
    setBusy('undo');
    setResult(null);
    try {
      const data = await post({ action: 'undo' });
      const count = (data.changes ?? []).length;
      setResult({ type: 'success', message: `Undid the last update (${count} ${count === 1 ? 'change' : 'changes'} restored).` });
      setConfirmUndo(false);
      setPreview(null);
      await load(false);
      onApplied?.();
    } catch (error) {
      setResult({ type: 'error', message: error instanceof Error ? error.message : 'Undo failed' });
    } finally {
      setBusy(null);
    }
  };

  const current = state?.current;
  const statsFor = (list: PriceStats[] | undefined, rarity: Rarity) =>
    list?.find((entry) => entry.rarity === rarity);

  const priceGrid = (
    label: string,
    values: PriceInputs,
    setValues: (next: PriceInputs) => void,
    stats: PriceStats[] | undefined,
    idPrefix: string,
  ) => (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-black text-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {RARITIES.map((rarity) => {
          const stat = statsFor(stats, rarity);
          const locked = !!stat?.tradeOnly;
          return (
            <label key={rarity} htmlFor={`${idPrefix}-${rarity}`} className="flex min-w-0 flex-col gap-1">
              <span className={cn('text-[11px] font-black capitalize', RARITY_TEXT[rarity])}>{rarity}</span>
              <input
                id={`${idPrefix}-${rarity}`}
                type="number"
                min={1}
                inputMode="numeric"
                placeholder={locked ? '—' : 'Keep'}
                disabled={locked}
                value={values[rarity]}
                onChange={(e) => {
                  setValues({ ...values, [rarity]: e.target.value });
                  edited();
                }}
                className={inputClass}
              />
              <span className="truncate text-[10px] font-medium text-muted-foreground">{nowText(stat)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mb-4 rounded-2xl border border-border/60 bg-muted/25">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-foreground">Prices & economy update</div>
          <div className="text-[11px] font-medium text-muted-foreground">
            Set prices for a whole rarity, plus gift pity and quest rewards, in one update
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border/40 px-3 pb-3 pt-3">
          {loadError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {loadError}
              <button type="button" onClick={() => void load(true)} className="ml-auto font-black underline">
                Retry
              </button>
            </div>
          )}

          {!state && !loadError ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : null}

          {state && current && (
            <>
              {priceGrid('Outfit prices by rarity', itemPrices, setItemPrices, current.itemPrices, 'eco-item')}
              {priceGrid('Background prices by rarity', backgroundPrices, setBackgroundPrices, current.backgroundPrices, 'eco-bg')}
              <p className="-mt-2 text-[11px] font-medium text-muted-foreground">
                A blank field keeps today&apos;s prices. Only items already for sale change; free items, gift boxes and the default background stay as they are.
              </p>

              <div className="flex flex-col gap-3">
                <span className="text-xs font-black text-foreground">Rewards</span>

                <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={usePity}
                      onChange={(e) => { setUsePity(e.target.checked); edited(); }}
                      className="h-4 w-4 accent-primary"
                    />
                    Gift pity
                    <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">
                      Now {current.pity.softPityLuck} · {current.pity.softPityBonusPoints} · {current.pity.hardPityLuck} · {current.pity.epicPityLuck}
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PITY_FIELDS.map(({ key, label }) => (
                      <label key={key} htmlFor={`eco-pity-${key}`} className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
                        <input
                          id={`eco-pity-${key}`}
                          type="number"
                          min={0}
                          disabled={!usePity}
                          value={pity[key]}
                          onChange={(e) => { setPity({ ...pity, [key]: e.target.value }); edited(); }}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={useDaily}
                      onChange={(e) => { setUseDaily(e.target.checked); edited(); }}
                      className="h-4 w-4 accent-primary"
                    />
                    Daily quest rewards
                    <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">
                      Now {current.dailySlotFlies.length ? current.dailySlotFlies.map((value) => (value === null ? '—' : value)).join(' · ') : 'no daily recipe'}
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {daily.map((value, index) => (
                      <label key={index} htmlFor={`eco-daily-${index}`} className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-muted-foreground">Slot {index + 1}</span>
                        <input
                          id={`eco-daily-${index}`}
                          type="number"
                          min={0}
                          disabled={!useDaily}
                          value={value}
                          onChange={(e) => {
                            const next = [...daily];
                            next[index] = e.target.value;
                            setDaily(next);
                            edited();
                          }}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={useSweep}
                      onChange={(e) => { setUseSweep(e.target.checked); edited(); }}
                      className="h-4 w-4 accent-primary"
                    />
                    Clean Sweep reward
                    <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">
                      Now {current.cleanSweepFlies}
                    </span>
                  </label>
                  <input
                    id="eco-sweep"
                    type="number"
                    min={0}
                    disabled={!useSweep}
                    value={sweep}
                    onChange={(e) => { setSweep(e.target.value); edited(); }}
                    className={cn(inputClass, 'sm:max-w-[10rem]')}
                  />
                </div>
              </div>

              {result && (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium',
                    result.type === 'success'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  {result.type === 'success' ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  {result.message}
                </div>
              )}

              {preview && (
                <div className="flex flex-col gap-2 rounded-xl border border-amber-400/50 bg-amber-500/5 p-3">
                  <span className="text-xs font-black text-foreground">
                    {preview.length === 0 ? 'Nothing to change. Everything already matches.' : 'This update will change'}
                  </span>
                  {preview.map((change) => (
                    <div key={change.key} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="font-bold text-foreground">{change.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {change.from} → <span className="font-bold text-foreground">{change.to}</span>
                      </span>
                      {typeof change.count === 'number' && (
                        <span className="text-[11px] text-muted-foreground">
                          ({change.count} {change.key === 'daily' ? 'recipes' : 'items'})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {preview && preview.length > 0 ? (
                  <>
                    <Button onClick={runApply} disabled={busy !== null} className="font-black">
                      {busy === 'apply' ? (
                        <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      ) : (
                        `Apply ${preview.length} ${preview.length === 1 ? 'change' : 'changes'}`
                      )}
                    </Button>
                    <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy !== null}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={runPreview} disabled={busy !== null} className="font-black">
                    {busy === 'preview' ? (
                      <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    ) : (
                      'Update'
                    )}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => fillRecommended(state.recommended)}
                  disabled={busy !== null}
                  className="text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Use recommended values
                </button>
              </div>

              {state.lastUpdate && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                  <span>
                    Last update {new Date(state.lastUpdate.at).toLocaleString()} · {state.lastUpdate.changes.length}{' '}
                    {state.lastUpdate.changes.length === 1 ? 'change' : 'changes'}
                  </span>
                  {confirmUndo ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={runUndo} disabled={busy !== null} className="h-7 font-black">
                        {busy === 'undo' ? (
                          <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        ) : (
                          'Yes, undo it'
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmUndo(false)} className="h-7">
                        Keep it
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmUndo(true)}
                      disabled={busy !== null}
                      className="ml-auto flex items-center gap-1 font-bold text-foreground hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Undo last update
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
