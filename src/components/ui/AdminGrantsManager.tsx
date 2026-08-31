'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronLeft,
  Crown,
  Gift,
  ImageIcon,
  Loader2,
  Search,
  Shirt,
  Undo2,
  Wind,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type GrantKind = 'flies' | 'premium' | 'item' | 'background';

type Player = {
  id: string;
  name: string;
  email: string | null;
  friendCode: string | null;
  isGuest: boolean;
  createdAt: string | null;
  premiumUntil: string | null;
  isPremium: boolean;
  flies: number;
};

type CatalogEntry = {
  id: string;
  name: string;
  kind: 'item' | 'background';
  rarity: string;
  slot?: string;
  priceFlies?: number;
};

type GrantRow = {
  _id: string;
  adminEmail: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  kind: GrantKind;
  amount: number;
  itemId?: string;
  itemName?: string;
  reason: string;
  status: 'applied' | 'failed' | 'reverted';
  error?: string;
  revertedByEmail?: string;
  revertResult?: { shortfall?: number };
  createdAt: string;
};

const KINDS: {
  kind: GrantKind;
  label: string;
  unit: string;
  icon: React.ReactNode;
  accent: string;
  presets: number[];
  hint: string;
}[] = [
  {
    kind: 'flies',
    label: 'Flies',
    unit: 'flies',
    icon: <Wind className="h-4 w-4" />,
    accent: 'text-emerald-600 dark:text-emerald-400',
    presets: [100, 500, 1000, 5000],
    hint: 'Lands in the balance and in the fly ledger under the "admin" source, so the economy report still adds up.',
  },
  {
    kind: 'premium',
    label: 'Plus days',
    unit: 'days',
    icon: <Crown className="h-4 w-4" />,
    accent: 'text-indigo-600 dark:text-indigo-400',
    presets: [7, 30, 90, 365],
    hint: 'Stacks onto whatever is left, so a gift to a current member extends rather than truncates.',
  },
  {
    kind: 'item',
    label: 'Cosmetic',
    unit: '×',
    icon: <Shirt className="h-4 w-4" />,
    accent: 'text-violet-600 dark:text-violet-400',
    presets: [1, 2, 3],
    hint: 'Arrives marked unseen, so the wardrobe shows the new-item dot on their next visit.',
  },
  {
    kind: 'background',
    label: 'Background',
    unit: '×',
    icon: <ImageIcon className="h-4 w-4" />,
    accent: 'text-sky-600 dark:text-sky-400',
    presets: [1, 2, 3],
    hint: 'Added to their background inventory; they still choose when to equip it.',
  },
];

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-emerald-500',
  rare: 'text-sky-500',
  epic: 'text-violet-500',
  legendary: 'text-amber-500',
};

const inputClass =
  'h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary';

const REASON_MAX = 200;

const kindMeta = (kind: GrantKind) => KINDS.find((k) => k.kind === kind)!;

function describe(row: GrantRow) {
  const meta = kindMeta(row.kind);
  if (row.kind === 'flies') return `${row.amount.toLocaleString()} flies`;
  if (row.kind === 'premium') return `${row.amount} Plus ${row.amount === 1 ? 'day' : 'days'}`;
  return `${row.itemName ?? row.itemId} ×${row.amount} · ${meta.label}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function AdminGrantsManager() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<Player | null>(null);

  const [kind, setKind] = useState<GrantKind>('flies');
  const [amount, setAmount] = useState<number>(100);
  const [itemId, setItemId] = useState<string>('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [reason, setReason] = useState('');

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const meta = kindMeta(kind);
  const needsItem = kind === 'item' || kind === 'background';

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/grants/users?q=${encodeURIComponent(query.trim())}`,
          { credentials: 'include', signal: controller.signal },
        );
        const data = await res.json();
        setResults(data.users ?? []);
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    fetch('/api/admin/campaigns/reward-catalog', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCatalog(data.entries ?? []))
      .catch(() => setCatalog([]));
  }, []);

  const loadHistory = useCallback(async (userId?: string) => {
    const url = userId
      ? `/api/admin/grants?userId=${encodeURIComponent(userId)}&limit=30`
      : '/api/admin/grants?limit=30';
    try {
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      setGrants(data.grants ?? []);
    } catch {
      setGrants([]);
    }
  }, []);

  useEffect(() => {
    loadHistory(target?.id);
  }, [target?.id, loadHistory]);

  useEffect(() => {
    setAmount(meta.presets[0]);
    setItemId('');
    setPendingId(null);
  }, [kind, meta.presets]);

  const pickable = useMemo(() => {
    const wanted = kind === 'background' ? 'background' : 'item';
    const needle = catalogQuery.trim().toLowerCase();
    return catalog
      .filter((entry) => entry.kind === wanted)
      .filter(
        (entry) =>
          !needle ||
          entry.name.toLowerCase().includes(needle) ||
          entry.id.toLowerCase().includes(needle),
      );
  }, [catalog, catalogQuery, kind]);

  const selectedEntry = catalog.find(
    (entry) => entry.id === itemId && entry.kind === (kind === 'background' ? 'background' : 'item'),
  );

  const invalid = (() => {
    if (!target) return 'Pick a player first';
    if (!Number.isFinite(amount) || amount < 1) return 'Enter an amount';
    if (needsItem && !itemId) return 'Pick something to give';
    if (reason.trim().length < 3) return 'Write a reason';
    return null;
  })();

  const summary = target
    ? `${
        kind === 'flies'
          ? `${amount.toLocaleString()} flies`
          : kind === 'premium'
            ? `${amount} Plus ${amount === 1 ? 'day' : 'days'}`
            : `${selectedEntry?.name ?? itemId} ×${amount}`
      } → ${target.name}`
    : '';

  const arm = () => {
    if (invalid) {
      flash('error', invalid);
      return;
    }
    setPendingId(crypto.randomUUID());
  };

  const submit = async () => {
    if (!pendingId || !target) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: pendingId,
          userId: target.id,
          kind,
          amount,
          itemId: needsItem ? itemId : undefined,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('error', data.error ?? 'Grant failed');
        return;
      }
      flash(
        'success',
        data.duplicate
          ? 'Already applied — this submission was counted once.'
          : `Sent ${summary}`,
      );
      setPendingId(null);
      setReason('');
      await loadHistory(target.id);
      const refreshed = await fetch(
        `/api/admin/grants/users?q=${encodeURIComponent(target.id)}`,
        { credentials: 'include' },
      )
        .then((r) => r.json())
        .catch(() => null);
      if (refreshed?.users?.[0]) setTarget(refreshed.users[0]);
    } catch {
      flash('error', 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const revert = async (grantId: string) => {
    setReverting(grantId);
    try {
      const res = await fetch('/api/admin/grants/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ grantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('error', data.error ?? 'Revert failed');
        return;
      }
      const shortfall = data.grant?.revertResult?.shortfall ?? 0;
      flash(
        'success',
        shortfall > 0
          ? `Reverted — ${shortfall.toLocaleString()} already spent, so that much could not be taken back.`
          : 'Reverted.',
      );
      await loadHistory(target?.id);
    } catch {
      flash('error', 'Network error');
    } finally {
      setReverting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="rounded-2xl bg-pink-500/10 p-3 text-pink-600 dark:text-pink-400">
            <Gift className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">
              Player grants
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Hand a player flies, Plus, a cosmetic or a background — every grant
              logged, every grant reversible.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-bold',
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
          >
            {message.text}
          </div>
        )}

        <Group step="1" title="Who" subtitle="Search by name, email, friend code or user id.">
          {target ? (
            <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-black text-primary">
                {target.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-black">{target.name}</span>
                  {target.isPremium && (
                    <span className="rounded-md bg-indigo-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                      PLUS
                    </span>
                  )}
                  {target.isGuest && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                      GUEST
                    </span>
                  )}
                </div>
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {target.email ?? 'no email'} · {target.flies.toLocaleString()} flies
                  {target.premiumUntil
                    ? ` · Plus until ${new Date(target.premiumUntil).toLocaleDateString()}`
                    : ''}
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                  {target.id}
                </p>
              </div>
              <button
                onClick={() => {
                  setTarget(null);
                  setPendingId(null);
                  setQuery('');
                }}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Change player"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, email, friend code or user id"
                  className={cn(inputClass, 'pl-9')}
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {results.length > 0 && (
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-muted/40 p-1.5">
                  {results.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => setTarget(player)}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-background"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                        {player.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black">
                          {player.name}
                          {player.isPremium && (
                            <span className="ml-1.5 text-[10px] font-black text-indigo-500">
                              PLUS
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] font-medium text-muted-foreground">
                          {player.email ?? player.id}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] font-black text-muted-foreground">
                        {player.flies.toLocaleString()} flies
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  Nobody matches “{query.trim()}”.
                </p>
              )}
            </div>
          )}
        </Group>

        <Group step="2" title="What" subtitle={meta.hint}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((entry) => (
              <button
                key={entry.kind}
                onClick={() => setKind(entry.kind)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition-colors',
                  kind === entry.kind
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60',
                )}
              >
                <span className={kind === entry.kind ? entry.accent : ''}>
                  {entry.icon}
                </span>
                {entry.label}
              </button>
            ))}
          </div>

          {needsItem && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder={`Search ${kind === 'background' ? 'backgrounds' : 'cosmetics'}`}
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl bg-muted/40 p-1.5">
                {pickable.length === 0 && (
                  <p className="px-2 py-3 text-xs font-medium text-muted-foreground">
                    Nothing matches.
                  </p>
                )}
                {pickable.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setItemId(entry.id);
                      setPendingId(null);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                      itemId === entry.id ? 'bg-background ring-1 ring-primary/40' : 'hover:bg-background',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">
                        {entry.name}
                      </span>
                      <span
                        className={cn(
                          'block truncate text-[10px] font-bold',
                          RARITY_COLORS[entry.rarity] ?? 'text-muted-foreground',
                        )}
                      >
                        {entry.rarity}
                        {entry.slot ? ` · ${entry.slot}` : ''} · {entry.id}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={Number.isFinite(amount) ? amount : ''}
                min={1}
                onChange={(event) => {
                  setAmount(Math.floor(Number(event.target.value)));
                  setPendingId(null);
                }}
                className={cn(inputClass, 'w-32')}
              />
              <span className="text-xs font-black text-muted-foreground">
                {meta.unit}
              </span>
            </div>
            {meta.presets.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setAmount(preset);
                  setPendingId(null);
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-black transition-colors',
                  amount === preset
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>
        </Group>

        <Group
          step="3"
          title="Why"
          subtitle="The reason is stored with the grant. Write what a teammate reading this log in three months would need."
        >
          <input
            value={reason}
            maxLength={REASON_MAX}
            onChange={(event) => {
              setReason(event.target.value);
              setPendingId(null);
            }}
            placeholder="Compensation for the 12 Aug sync bug (ticket #204)"
            className={inputClass}
          />

          {pendingId ? (
            <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="font-black text-foreground">{summary}</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    This lands on a real account right away.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="h-4 w-4" />
                  )}
                  Confirm grant
                </button>
                <button
                  onClick={() => setPendingId(null)}
                  disabled={submitting}
                  className="rounded-xl bg-muted px-4 py-2 text-sm font-black text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={arm}
              disabled={!!invalid}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Gift className="h-4 w-4" />
              {invalid ?? 'Review grant'}
            </button>
          )}
        </Group>

        <Group
          title={target ? `Grants to ${target.name}` : 'Recent grants'}
          subtitle="Who gave what, to whom, and why. Reverting writes the inverse — it never erases the row."
        >
          {grants.length === 0 ? (
            <p className="text-xs font-medium text-muted-foreground">
              Nothing here yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {grants.map((row) => (
                <div
                  key={row._id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5',
                    row.status === 'reverted' && 'opacity-60',
                    row.status === 'failed' && 'ring-1 ring-red-500/40',
                  )}
                >
                  <span className={cn('shrink-0', kindMeta(row.kind).accent)}>
                    {kindMeta(row.kind).icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black">
                      {describe(row)}
                      {!target && (
                        <span className="font-bold text-muted-foreground">
                          {' '}
                          → {row.userName ?? row.userId}
                        </span>
                      )}
                      {row.status === 'reverted' && (
                        <span className="ml-1.5 text-[10px] font-black uppercase text-muted-foreground">
                          reverted
                        </span>
                      )}
                      {row.status === 'failed' && (
                        <span className="ml-1.5 text-[10px] font-black uppercase text-red-500">
                          failed
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] font-medium text-muted-foreground">
                      {row.reason} · {row.adminEmail} · {timeAgo(row.createdAt)}
                      {row.revertedByEmail ? ` · undone by ${row.revertedByEmail}` : ''}
                      {row.error ? ` · ${row.error}` : ''}
                    </p>
                  </div>
                  {row.status === 'applied' && (
                    <button
                      onClick={() => revert(row._id)}
                      disabled={reverting === row._id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                    >
                      {reverting === row._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" />
                      )}
                      Revert
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Group>
      </div>
    </div>
  );
}

function Group({
  step,
  title,
  subtitle,
  children,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-2.5">
        {step && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-black text-muted-foreground">
            {step}
          </span>
        )}
        <div>
          <h2 className="text-sm font-black tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs font-medium leading-snug text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
