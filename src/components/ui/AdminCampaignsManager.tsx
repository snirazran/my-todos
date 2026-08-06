'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Copy,
  List as ListIcon,
  ImagePlus,
  Loader2,
  Monitor,
  Moon,
  MousePointerClick,
  Plus,
  RotateCcw,
  Smartphone,
  Sun,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLY_PACKS } from '@/lib/flyPacks';
import { NudgeBannerCard } from '@/components/campaigns/CampaignSurfaces';
import { CampaignCanvasView } from '@/components/campaigns/CampaignCanvasView';
import {
  CampaignCanvasEditor,
  CanvasAssets,
} from '@/components/ui/admin/CampaignCanvasEditor';
import type { RiveContents, RiveSignal } from '@/components/campaigns/CampaignRiveArt';
import { resolveRiveSignal } from '@/lib/campaigns/riveSignals';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  CTA_LABELS,
  DEFAULT_CAPS,
  DEFAULT_COPY,
  DEFAULT_CANVAS,
  DEFAULT_RIVE,
  DEFAULT_TARGETING,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  RIVE_SIGNAL_SOURCES,
  RIVE_SIGNAL_SOURCE_LABELS,
  SIGNAL_ACTIONS,
  SIGNAL_ACTION_LABELS,
  ELEMENT_LABELS,
  isClickableElement,
  TEMPLATE_HELP,
  TEMPLATE_LABELS,
  TIER_HELP,
  TIER_LABELS,
  TIER_SYSTEM_HELP,
  TRIGGER_HELP,
  TRIGGER_LABELS,
  TRIGGER_OPTIONS,
  isBlockingTemplate,
  type CampaignArtKind,
  type CampaignCaps,
  type CampaignCopy,
  type CampaignAssetRef,
  type CampaignCanvas,
  type CampaignCta,
  type CampaignOffer,
  type CampaignPayload,
  type CampaignRive,
  type CampaignRiveButton,
  type CampaignStatus,
  type CampaignTargeting,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTrigger,
  type CampaignTriggerRule,
  type RiveSignalSource,
  type SignalAction,
} from '@/lib/campaigns/types';

type CampaignRow = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  status: CampaignStatus;
  priority: number;
  art: CampaignArtKind;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  rive: CampaignRive;
  canvas: CampaignCanvas;
  assets: CampaignAssetRef[];
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string;
  /** The uploaded .riv, ignored while a library path is set. */
  riveUploadUrl: string;
};

type Stats = {
  _id: string;
  impressions: number;
  clicks: number;
  dismissals: number;
  conversions: number;
  reach: number;
};

type ExplainRow = {
  id: string;
  name: string;
  eligible: boolean;
  reason: string;
  impressions: number;
  dismissals: number;
  converted: boolean;
};

type ElementStat = { campaignId: string; elementId: string; clicks: number };

type PreviewSurface = 'phone' | 'web';

type SeenSignal = {
  name: string;
  source: RiveSignalSource;
  count: number;
  properties?: Record<string, number | boolean | string>;
};

const STATUS_STYLES: Record<CampaignStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  test: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  paused: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
};

const blank = (): CampaignRow => ({
  id: '',
  name: '',
  template: 'canvas',
  tier: 'nudge',
  status: 'draft',
  priority: 50,
  art: 'image',
  copy: { ...DEFAULT_COPY },
  cta: { action: 'dismiss', path: '' },
  offer: { packId: '', bonusLabel: '' },
  rive: { ...DEFAULT_RIVE, buttons: [] },
  canvas: { ...DEFAULT_CANVAS, elements: [] },
  assets: [],
  triggers: [{ event: 'session_start' }],
  targeting: { ...DEFAULT_TARGETING },
  caps: { ...DEFAULT_CAPS },
  startAt: null,
  endAt: null,
  imageUrl: '',
  riveUploadUrl: '',
});

const toLocalInput = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : '';

const toPayload = (row: CampaignRow): CampaignPayload => ({
  id: row.id || 'preview',
  name: row.name,
  template: row.template,
  tier: row.tier,
  priority: row.priority,
  status: row.status,
  art: row.art,
  imageUrl: row.imageUrl,
  riveUrl: row.rive.libraryPath || row.riveUploadUrl,
  rive: row.rive,
  copy: row.copy,
  cta: row.cta,
  offer: row.offer,
  canvas: row.canvas,
  assets: row.assets,
  endAt: row.endAt,
  triggers: row.triggers,
  delayMs: row.caps.delayMs,
});

/** Everything worth saying out loud before a campaign goes live. */
function reviewCampaign(row: CampaignRow): string[] {
  const notes: string[] = [];
  const canvas = row.template === 'canvas';
  const elements = row.canvas.elements;

  if (!row.triggers.length) notes.push('No trigger — this can never show.');

  if (canvas) {
    if (!row.imageUrl) notes.push('No artwork uploaded yet.');
    if (!elements.length) notes.push('Nothing placed on the artwork.');
    if (!elements.some((element) => element.action === 'dismiss')) {
      notes.push(
        'No close button — tapping the dark background still closes it, but give people the X.',
      );
    }
    for (const element of elements) {
      if (element.action === 'navigate' && !element.path?.trim()) {
        notes.push(`"${element.label || element.type}" navigates but has no path.`);
      }
      if ((element.type === 'image' || element.type === 'rive') && !element.assetId) {
        notes.push(`"${element.label || element.type}" has no file picked.`);
      }
      if (element.type === 'timer' && element.timerMode === 'schedule' && !row.endAt) {
        notes.push('A timer counts down to the end date, but no end date is set.');
      }
      if (element.w < 4 || element.h < 3) {
        notes.push(`"${element.label || element.type}" is tiny — hard to read and hard to tap.`);
      }
    }
  } else if (!row.copy.headline.trim()) {
    notes.push('No headline.');
  }

  if (row.cta.action === 'navigate' && !row.cta.path?.trim()) {
    notes.push('The banner button navigates but no path is set.');
  }
  for (const button of row.rive.buttons) {
    if (button.action === 'navigate' && !button.path?.trim()) {
      notes.push(`Rive button "${button.signal}" navigates but has no path.`);
    }
  }
  if (row.targeting.rollout === 0) notes.push('Rollout is 0% — nobody is in the audience.');
  if (row.caps.perUser === 0 && row.caps.cooldownHours === 0) {
    notes.push('No impression cap and no cooldown — this can repeat endlessly.');
  }
  if (row.endAt && new Date(row.endAt) < new Date()) notes.push('The schedule already ended.');
  return notes;
}

export function AdminCampaignsManager() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [elementStats, setElementStats] = useState<ElementStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CampaignRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [explainEmail, setExplainEmail] = useState('');
  const [explain, setExplain] = useState<{
    audience: Record<string, unknown>;
    results: ExplainRow[];
  } | null>(null);
  const [library, setLibrary] = useState<string[]>([]);
  const [contents, setContents] = useState<RiveContents | null>(null);
  const [seen, setSeen] = useState<SeenSignal[]>([]);
  const [signalLog, setSignalLog] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [surface, setSurface] = useState<PreviewSurface>('phone');
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const riveRef = useRef<HTMLInputElement>(null);

  const statById = useMemo(() => new Map(stats.map((s) => [s._id, s])), [stats]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/campaigns', { credentials: 'include' });
      const data = await res.json();
      setRows(
        (data.items ?? []).map((item: Partial<CampaignRow>) => ({
          ...blank(),
          ...item,
          copy: { ...DEFAULT_COPY, ...(item.copy ?? {}) },
          targeting: { ...DEFAULT_TARGETING, ...(item.targeting ?? {}) },
          caps: { ...DEFAULT_CAPS, ...(item.caps ?? {}) },
          rive: { ...DEFAULT_RIVE, ...(item.rive ?? {}), buttons: item.rive?.buttons ?? [] },
          canvas: { ...DEFAULT_CANVAS, ...(item.canvas ?? {}), elements: item.canvas?.elements ?? [] },
          assets: item.assets ?? [],
        })),
      );
      setStats(data.stats ?? []);
      setElementStats(data.elementStats ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/api/admin/campaigns/rive-library', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setLibrary(d.files ?? []))
      .catch(() => {});
  }, []);

  const editing = draft?.id ?? null;
  useEffect(() => {
    setSeen([]);
    setSignalLog([]);
    setContents(null);
  }, [editing]);

  const patch = (partial: Partial<CampaignRow>) =>
    setDraft((d) => (d ? { ...d, ...partial } : d));

  const patchRive = (partial: Partial<CampaignRive>) =>
    setDraft((d) => (d ? { ...d, rive: { ...d.rive, ...partial } } : d));

  const patchCanvas = (partial: Partial<CampaignCanvas>) =>
    setDraft((d) => (d ? { ...d, canvas: { ...d.canvas, ...partial } } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: draft.id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      await load();
      setDraft({
        ...blank(),
        ...data.item,
        imageUrl: draft.imageUrl,
        riveUploadUrl: draft.riveUploadUrl,
      });
      setNotice('Saved.');
    } finally {
      setSaving(false);
    }
  };

  const clone = async (id: string) => {
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneOf: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Duplicate failed');
      return;
    }
    await load();
    setNotice(`Duplicated as "${data.item.name}" (draft).`);
  };

  const remove = async (id: string) => {
    await fetch('/api/admin/campaigns', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (draft?.id === id) setDraft(null);
    await load();
  };

  const upload = async (file: File, kind: 'background' | 'asset' | 'rive') => {
    if (!draft?.id) {
      setError('Save the campaign first, then add art.');
      return;
    }
    const form = new FormData();
    form.append('id', draft.id);
    form.append('kind', kind);
    form.append('file', file);
    const res = await fetch('/api/admin/campaigns/upload', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Upload failed');
      return;
    }
    setDraft((d) => {
      if (!d) return d;
      if (kind === 'background') {
        return {
          ...d,
          imageUrl: data.url,
          // The canvas takes the shape of the artwork, so nothing has to be
          // measured by hand.
          canvas: data.aspect
            ? { ...d.canvas, aspect: Math.min(3, Math.max(0.3, data.aspect)) }
            : d.canvas,
        };
      }
      return { ...d, assets: [...d.assets, data.asset] };
    });
    await load();
  };

  const deleteAsset = async (assetId: string) => {
    if (!draft?.id) return;
    await fetch('/api/admin/campaigns/upload', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draft.id, assetId }),
    });
    setDraft((d) =>
      d ? { ...d, assets: d.assets.filter((asset) => asset.id !== assetId) } : d,
    );
    await load();
  };

  const resetMyState = async () => {
    if (!draft?.id) return;
    const res = await fetch('/api/admin/campaigns/reset', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: draft.id, email: explainEmail.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Reset failed');
      return;
    }
    setNotice(
      data.cleared
        ? 'History cleared — this campaign can show again.'
        : 'Nothing to clear; this account had not seen it.',
    );
  };

  const runExplain = async () => {
    const params = new URLSearchParams();
    if (explainEmail.trim()) params.set('email', explainEmail.trim());
    const res = await fetch(`/api/admin/campaigns/explain?${params}`, {
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Dry run failed');
      return;
    }
    setExplain(data);
  };

  const onRiveContents = useCallback((next: RiveContents) => {
    setContents((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    );
  }, []);

  const onRiveSignal = useCallback((signal: RiveSignal) => {
    setSeen((current) => {
      const index = current.findIndex(
        (item) => item.name === signal.name && item.source === signal.source,
      );
      if (index === -1) {
        return [
          ...current,
          {
            name: signal.name,
            source: signal.source,
            count: 1,
            properties: signal.properties,
          },
        ];
      }
      const next = [...current];
      next[index] = { ...next[index], count: next[index].count + 1 };
      return next;
    });
    setSignalLog((log) =>
      [
        `${new Date().toLocaleTimeString()} · ${signal.name || signal.url || 'unnamed'}`,
        ...log,
      ].slice(0, 6),
    );
  }, []);

  const mapSignal = (signal: SeenSignal) => {
    setDraft((d) => {
      if (!d) return d;
      if (
        d.rive.buttons.some((b) => b.signal === signal.name && b.source === signal.source)
      ) {
        return d;
      }
      const button: CampaignRiveButton = {
        signal: signal.name,
        source: signal.source,
        action: 'cta',
        path: '',
        packId: '',
        closes: true,
      };
      return { ...d, art: 'rive', rive: { ...d.rive, buttons: [...d.rive.buttons, button] } };
    });
  };

  const patchButton = (index: number, partial: Partial<CampaignRiveButton>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            rive: {
              ...d.rive,
              buttons: d.rive.buttons.map((button, i) =>
                i === index ? { ...button, ...partial } : button,
              ),
            },
          }
        : d,
    );

  const preview = useMemo(() => toPayload(draft ?? blank()), [draft]);
  const notes = draft ? reviewCampaign(draft) : [];
  const artboards = contents?.artboards ?? [];
  const stateMachines =
    artboards.find((board) => board.name === draft?.rive.artboard)?.stateMachines ??
    artboards[0]?.stateMachines ??
    [];

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 sm:px-8">
      <div className="mx-auto max-w-[110rem]">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Popups & offers</h1>
            <p className="text-sm font-medium text-muted-foreground">
              Design a popup, pick when it fires, and the app decides who actually sees it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen((open) => !open)}
            className="ml-auto flex h-10 items-center gap-1.5 rounded-xl bg-muted px-4 text-sm font-black"
          >
            <ListIcon className="h-4 w-4" />
            Campaigns
            <span className="rounded-full bg-background px-1.5 text-[11px]">{rows.length}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', listOpen ? '' : '-rotate-90')}
            />
          </button>
          <button
            type="button"
            onClick={() => setDryRunOpen((open) => !open)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-black transition-colors',
              dryRunOpen ? 'bg-foreground text-background' : 'bg-muted text-foreground',
            )}
          >
            <Wand2 className="h-4 w-4" />
            Dry run
          </button>
          <button
            type="button"
            onClick={() => setDraft(blank())}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

        {dryRunOpen ? (
          <div className="mb-6 rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-black">Dry run</p>
              <p className="text-xs font-medium text-muted-foreground">
                Check every campaign against a real account — and see the reason when one
                wouldn&apos;t show.
              </p>
              <div className="ml-auto flex gap-2">
                <input
                  value={explainEmail}
                  onChange={(e) => setExplainEmail(e.target.value)}
                  placeholder="email (blank = you)"
                  className="h-10 w-64 rounded-xl bg-muted px-3 text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  onClick={runExplain}
                  className="h-10 rounded-xl bg-foreground px-4 text-sm font-black text-background"
                >
                  Run
                </button>
              </div>
            </div>
            {explain ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {Object.entries(explain.audience)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(' · ')}
                </p>
                {explain.results.map((r) => (
                  <p key={r.id} className="text-xs font-bold">
                    <span className={r.eligible ? 'text-emerald-500' : 'text-muted-foreground'}>
                      {r.eligible ? '✓' : '✕'} {r.name}
                    </span>
                    <span className="font-medium text-muted-foreground"> — {r.reason}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {notice}
          </p>
        ) : null}

        <div
          className={cn(
            'grid gap-6',
            listOpen
              ? 'xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]'
              : 'xl:grid-cols-[minmax(0,1fr)_auto]',
          )}
        >
          <div className={cn('space-y-2', listOpen ? '' : 'hidden')}>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            {rows.map((row) => {
              const stat = statById.get(row.id);
              const impressions = stat?.impressions ?? 0;
              const rate = (value: number) =>
                impressions ? `${Math.round((value / impressions) * 100)}%` : '—';
              return (
                <div
                  key={row.id}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 transition-colors',
                    draft?.id === row.id
                      ? 'ring-2 ring-primary'
                      : 'ring-border hover:ring-foreground/20',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setDraft(row)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {row.art === 'rive' ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                        <Zap className="h-5 w-5" />
                      </span>
                    ) : row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <ImagePlus className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-black">{row.name}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
                            STATUS_STYLES[row.status],
                          )}
                        >
                          {row.status}
                        </span>
                        {row.targeting.rollout < 100 ? (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black text-sky-600 dark:text-sky-400">
                            {row.targeting.rollout}%
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-muted-foreground">
                        {row.template} ·{' '}
                        {row.triggers.map((t) => TRIGGER_LABELS[t.event]).join(', ') ||
                          'no triggers'}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-bold text-muted-foreground">
                        {impressions} shown · {rate(stat?.clicks ?? 0)} clicked ·{' '}
                        {rate(stat?.dismissals ?? 0)} dismissed · {stat?.conversions ?? 0}{' '}
                        converted
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void clone(row.id)}
                    aria-label="Duplicate"
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    aria-label="Delete"
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}

            {!loading && !rows.length ? (
              <p className="px-1 text-xs font-bold text-muted-foreground">
                No campaigns yet. Hit New to design one.
              </p>
            ) : null}
          </div>

          {draft ? (
            <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black">
                  {draft.id ? `Editing ${draft.id}` : 'New campaign'}
                </p>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {notes.length ? (
                <div className="rounded-xl bg-amber-500/10 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Before this goes live
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {notes.map((note) => (
                      <li key={note} className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        • {note}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Section title="Basics" defaultOpen>
                <Field label="Name">
                  <input
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    className="input"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Template">
                    <Hint text={TEMPLATE_HELP[draft.template]}>
                      <select
                        value={draft.template}
                        onChange={(e) =>
                          patch({ template: e.target.value as CampaignTemplate })
                        }
                        className="input"
                      >
                        {CAMPAIGN_TEMPLATES.map((t) => (
                          <option key={t} value={t}>
                            {TEMPLATE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </Hint>
                  </Field>
                  <Field label="Status">
                    <select
                      value={draft.status}
                      onChange={(e) => patch({ status: e.target.value as CampaignStatus })}
                      className="input"
                    >
                      {CAMPAIGN_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <p className="text-[11px] font-medium leading-snug text-muted-foreground">
                  {TEMPLATE_HELP[draft.template]}{' '}
                  <span className="font-bold">
                    {isBlockingTemplate(draft.template)
                      ? 'Capped at one takeover per session across all campaigns.'
                      : 'Never blocks the user.'}
                  </span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tier" help={TIER_SYSTEM_HELP}>
                    <select
                      value={draft.tier}
                      onChange={(e) => patch({ tier: e.target.value as CampaignTier })}
                      className="input"
                    >
                      {CAMPAIGN_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {TIER_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={`Priority (${draft.priority})`}
                    help="Only breaks ties between campaigns in the same tier. It can never beat a higher tier."
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.priority}
                      onChange={(e) => patch({ priority: Number(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                </div>
                <p className="-mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
                  {TIER_HELP[draft.tier]}
                </p>
              </Section>

              <Section
                title={draft.template === 'canvas' ? 'Artwork & elements' : 'Art'}
                defaultOpen
              >
                <CanvasAssets
                  campaign={preview}
                  canUpload={!!draft.id}
                  canvas={draft.template === 'canvas'}
                  onUpload={(file, kind) => void upload(file, kind)}
                  onDeleteAsset={(assetId) => void deleteAsset(assetId)}
                />

                {draft.template === 'canvas' ? (
                <>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={`Popup width (${Math.round(draft.canvas.maxWidth)}px)`}
                    help="How wide the artwork gets on the biggest screens. Everything on the canvas scales with it."
                  >
                    <input
                      type="range"
                      min={240}
                      max={720}
                      step={4}
                      value={draft.canvas.maxWidth}
                      onChange={(e) =>
                        patchCanvas({ maxWidth: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field
                    label={`Shape (${draft.canvas.aspect.toFixed(2)})`}
                    help="Width divided by height. Uploading artwork sets this to match the file."
                  >
                    <input
                      type="range"
                      min={0.3}
                      max={3}
                      step={0.01}
                      value={draft.canvas.aspect}
                      onChange={(e) => patchCanvas({ aspect: Number(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                </div>

                {draft.id ? (
                  <ElementAnalytics
                    campaignId={draft.id}
                    elements={draft.canvas.elements}
                    stats={elementStats}
                    impressions={statById.get(draft.id)?.impressions ?? 0}
                  />
                ) : null}

                <CampaignCanvasEditor
                  campaign={preview}
                  canvas={draft.canvas}
                  selectedId={selectedElementId}
                  onSelect={setSelectedElementId}
                  onChange={(canvas) => patch({ canvas })}
                  onSignal={onRiveSignal}
                  onRiveContents={onRiveContents}
                  dark={dark}
                />
                </>
                ) : null}
              </Section>


              {draft.canvas.elements.some((element) => element.type === 'rive') ? (
                <Section title="Rive buttons" defaultOpen>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Click the buttons in the preview. Every Rive Event the file fires shows up
                    here — map one to an action and it behaves exactly like an app button.
                    Data-bound triggers can&apos;t be discovered, so add those by name.
                  </p>

                  {seen.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {seen.map((signal) => {
                        const mapped = draft.rive.buttons.some(
                          (b) => b.signal === signal.name && b.source === signal.source,
                        );
                        return (
                          <button
                            key={`${signal.source}:${signal.name}`}
                            type="button"
                            disabled={mapped}
                            onClick={() => mapSignal(signal)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black',
                              mapped
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-violet-500/15 text-violet-600 hover:bg-violet-500/25 dark:text-violet-400',
                            )}
                          >
                            <MousePointerClick className="h-3 w-3" />
                            {signal.name || '(unnamed)'} ×{signal.count}
                            {mapped ? ' · mapped' : ' · map'}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-muted/60 px-3 py-2 text-[11px] font-bold text-muted-foreground">
                      No signals seen yet — click the animation in the preview.
                    </p>
                  )}

                  <div className="space-y-2">
                    {draft.rive.buttons.map((button, index) => (
                      <div
                        key={`${button.source}:${button.signal}:${index}`}
                        className="space-y-2 rounded-xl bg-muted/50 p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            value={button.signal}
                            onChange={(e) => patchButton(index, { signal: e.target.value })}
                            placeholder="signal name"
                            className="input flex-1"
                          />
                          <select
                            value={button.source}
                            onChange={(e) =>
                              patchButton(index, {
                                source: e.target.value as RiveSignalSource,
                              })
                            }
                            className="input w-36"
                          >
                            {RIVE_SIGNAL_SOURCES.map((source) => (
                              <option key={source} value={source}>
                                {RIVE_SIGNAL_SOURCE_LABELS[source]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              patchRive({
                                buttons: draft.rive.buttons.filter((_, i) => i !== index),
                              })
                            }
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={button.action}
                            onChange={(e) =>
                              patchButton(index, { action: e.target.value as SignalAction })
                            }
                            className="input flex-1"
                          >
                            {SIGNAL_ACTIONS.map((action) => (
                              <option key={action} value={action}>
                                {SIGNAL_ACTION_LABELS[action]}
                              </option>
                            ))}
                          </select>
                          {button.action === 'navigate' ? (
                            <input
                              value={button.path ?? ''}
                              onChange={(e) => patchButton(index, { path: e.target.value })}
                              placeholder="/wardrobe?tab=shop"
                              className="input flex-1"
                            />
                          ) : null}
                          {button.action === 'open_fly_shop' ? (
                            <select
                              value={button.packId ?? ''}
                              onChange={(e) => patchButton(index, { packId: e.target.value })}
                              className="input flex-1"
                            >
                              <option value="">No pack</option>
                              {FLY_PACKS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.id}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={button.closes}
                              onChange={(e) =>
                                patchButton(index, { closes: e.target.checked })
                              }
                            />
                            closes
                          </label>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        patchRive({
                          buttons: [
                            ...draft.rive.buttons,
                            {
                              signal: '',
                              source: 'trigger',
                              action: 'cta',
                              path: '',
                              packId: '',
                              closes: true,
                            },
                          ],
                        })
                      }
                      className="text-xs font-black text-primary"
                    >
                      + Add by name
                    </button>
                  </div>
                </Section>
              ) : null}

              {/* A canvas popup carries its own text and buttons as elements, so
                  this copy would never be drawn. Only the banner uses it. */}
              {draft.template === 'nudge-banner' ? (
              <Section title="Copy & button" defaultOpen>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Eyebrow">
                    <input
                      value={draft.copy.eyebrow}
                      onChange={(e) =>
                        patch({ copy: { ...draft.copy, eyebrow: e.target.value } })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Headline">
                    <input
                      value={draft.copy.headline}
                      onChange={(e) =>
                        patch({ copy: { ...draft.copy, headline: e.target.value } })
                      }
                      className="input"
                    />
                  </Field>
                </div>
                <Field label="Body">
                  <textarea
                    value={draft.copy.body}
                    onChange={(e) => patch({ copy: { ...draft.copy, body: e.target.value } })}
                    rows={2}
                    className="input"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Button label">
                    <input
                      value={draft.copy.ctaLabel}
                      onChange={(e) =>
                        patch({ copy: { ...draft.copy, ctaLabel: e.target.value } })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Dismiss label">
                    <input
                      value={draft.copy.dismissLabel}
                      onChange={(e) =>
                        patch({ copy: { ...draft.copy, dismissLabel: e.target.value } })
                      }
                      className="input"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Button does">
                    <select
                      value={draft.cta.action}
                      onChange={(e) =>
                        patch({
                          cta: { ...draft.cta, action: e.target.value as CampaignCta['action'] },
                        })
                      }
                      className="input"
                    >
                      {CTA_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {CTA_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.cta.action === 'navigate' ? (
                    <Field label="Path">
                      <input
                        value={draft.cta.path ?? ''}
                        onChange={(e) => patch({ cta: { ...draft.cta, path: e.target.value } })}
                        placeholder="/wardrobe?tab=shop"
                        className="input"
                      />
                    </Field>
                  ) : null}
                </div>

              </Section>
              ) : null}

              <Section title="Show when" defaultOpen>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Any one of these firing is enough. Hover a trigger to see exactly what
                  makes it fire in the app.
                </p>
                <div className="space-y-2">
                  {draft.triggers.map((rule, index) => {
                    const option = TRIGGER_OPTIONS[rule.event];
                    const patchRule = (partial: Partial<CampaignTriggerRule>) => {
                      const triggers = [...draft.triggers];
                      triggers[index] = { ...rule, ...partial };
                      patch({ triggers });
                    };
                    return (
                      <div key={`${rule.event}-${index}`} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Hint text={TRIGGER_HELP[rule.event]} className="flex-1">
                            <select
                              value={rule.event}
                              onChange={(e) =>
                                patchRule({
                                  event: e.target.value as CampaignTrigger,
                                  minGap: undefined,
                                  minDays: undefined,
                                  minMinutes: undefined,
                                  minStreak: undefined,
                                })
                              }
                              className="input"
                            >
                              {CAMPAIGN_TRIGGERS.map((t) => (
                                <option key={t} value={t}>
                                  {TRIGGER_LABELS[t]}
                                </option>
                              ))}
                            </select>
                          </Hint>
                          {option ? (
                            <Hint text={option.hint}>
                              <input
                                type="number"
                                value={(rule[option.key] as number | undefined) ?? ''}
                                placeholder={option.label}
                                onChange={(e) =>
                                  patchRule({
                                    [option.key]:
                                      e.target.value === ''
                                        ? undefined
                                        : Number(e.target.value),
                                  })
                                }
                                className="input w-28"
                              />
                            </Hint>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              patch({
                                triggers: draft.triggers.filter((_, i) => i !== index),
                              })
                            }
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      patch({ triggers: [...draft.triggers, { event: 'session_start' }] })
                    }
                    className="text-xs font-black text-primary"
                  >
                    + Add trigger
                  </button>
                </div>
              </Section>

              <Section title="Who sees it">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Payers">
                    <select
                      value={draft.targeting.payer}
                      onChange={(e) =>
                        patch({
                          targeting: {
                            ...draft.targeting,
                            payer: e.target.value as CampaignTargeting['payer'],
                          },
                        })
                      }
                      className="input"
                    >
                      {PAYER_TARGETS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Plus">
                    <select
                      value={draft.targeting.plus}
                      onChange={(e) =>
                        patch({
                          targeting: {
                            ...draft.targeting,
                            plus: e.target.value as CampaignTargeting['plus'],
                          },
                        })
                      }
                      className="input"
                    >
                      {PLUS_TARGETS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Platform">
                    <select
                      value={draft.targeting.platform}
                      onChange={(e) =>
                        patch({
                          targeting: {
                            ...draft.targeting,
                            platform: e.target.value as CampaignTargeting['platform'],
                          },
                        })
                      }
                      className="input"
                    >
                      {PLATFORM_TARGETS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <NumberField
                    label="Min days old"
                    value={draft.targeting.minDaysSinceSignup}
                    onChange={(v) =>
                      patch({ targeting: { ...draft.targeting, minDaysSinceSignup: v } })
                    }
                  />
                  <NumberField
                    label="Max days old"
                    value={draft.targeting.maxDaysSinceSignup}
                    onChange={(v) =>
                      patch({ targeting: { ...draft.targeting, maxDaysSinceSignup: v } })
                    }
                  />
                  <NumberField
                    label="Flies below"
                    value={draft.targeting.balanceBelow}
                    onChange={(v) =>
                      patch({ targeting: { ...draft.targeting, balanceBelow: v } })
                    }
                  />
                  <NumberField
                    label="Flies above"
                    value={draft.targeting.balanceAbove}
                    onChange={(v) =>
                      patch({ targeting: { ...draft.targeting, balanceAbove: v } })
                    }
                  />
                </div>

                <Field label={`Rollout — ${draft.targeting.rollout}% of the audience`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draft.targeting.rollout}
                    onChange={(e) =>
                      patch({
                        targeting: { ...draft.targeting, rollout: Number(e.target.value) },
                      })
                    }
                    className="w-full"
                  />
                </Field>
                <p className="-mt-1 text-[11px] font-medium text-muted-foreground">
                  The other {100 - draft.targeting.rollout}% is a stable holdout — same users
                  every time, so their numbers are a real baseline.
                </p>
              </Section>

              <Section title="How often">
                <div className="grid grid-cols-3 gap-3">
                  <NumberField
                    label="Max per user"
                    value={draft.caps.perUser}
                    onChange={(v) => patch({ caps: { ...draft.caps, perUser: v ?? 0 } })}
                  />
                  <NumberField
                    label="Cooldown (h)"
                    value={draft.caps.cooldownHours}
                    onChange={(v) => patch({ caps: { ...draft.caps, cooldownHours: v ?? 0 } })}
                  />
                  <NumberField
                    label="Stop after N dismissals"
                    value={draft.caps.suppressAfterDismissals}
                    onChange={(v) =>
                      patch({ caps: { ...draft.caps, suppressAfterDismissals: v ?? 0 } })
                    }
                  />
                </div>
                <NumberField
                  label="Delay after the trigger (ms)"
                  value={draft.caps.delayMs}
                  onChange={(v) => patch({ caps: { ...draft.caps, delayMs: v ?? 0 } })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starts">
                    <input
                      type="datetime-local"
                      value={toLocalInput(draft.startAt)}
                      onChange={(e) =>
                        patch({
                          startAt: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Ends">
                    <input
                      type="datetime-local"
                      value={toLocalInput(draft.endAt)}
                      onChange={(e) =>
                        patch({
                          endAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className="input"
                    />
                  </Field>
                </div>
              </Section>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save campaign'}
                </button>
                {draft.id ? (
                  <button
                    type="button"
                    onClick={resetMyState}
                    title="Clear this account's history so it can show again"
                    className="flex h-12 items-center gap-1.5 rounded-2xl bg-muted px-4 text-sm font-black"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm font-bold text-muted-foreground">
              Pick a campaign to edit, or create a new one.
            </p>
          )}

          {draft ? (
            <div className="xl:sticky xl:top-6 xl:self-start">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Live preview
                </p>
                <div className="ml-auto flex gap-1">
                  <div className="flex rounded-lg bg-muted p-0.5">
                    {(['phone', 'web'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSurface(mode)}
                        className={cn(
                          'flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-black transition-colors',
                          surface === mode
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground',
                        )}
                      >
                        {mode === 'phone' ? (
                          <Smartphone className="h-3.5 w-3.5" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5" />
                        )}
                        {mode === 'phone' ? 'Phone' : 'Web'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDark((d) => !d)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[11px] font-black"
                  >
                    {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                    {dark ? 'Dark' : 'Light'}
                  </button>
                </div>
              </div>

              <CampaignPreview
                row={draft}
                dark={dark}
                surface={surface}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onSignal={onRiveSignal}
                onContents={onRiveContents}
              />

              {signalLog.length ? (
                <div className="mt-2 rounded-xl bg-card p-2.5 ring-1 ring-border">
                  {signalLog.map((line, index) => (
                    <p
                      key={`${line}-${index}`}
                      className="truncate text-[11px] font-bold text-muted-foreground"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.75rem;
          background: hsl(var(--muted));
          padding: 0 0.75rem;
          font-size: 0.875rem;
          font-weight: 600;
          outline: none;
        }
        :global(textarea.input) {
          height: auto;
          padding: 0.5rem 0.75rem;
        }
      `}</style>
    </div>
  );
}

/**
 * The popup drawn with the same components the app uses, so what an admin
 * signs off on is what ships. Actions are described instead of run — clicking
 * "Open the fly shop" here should not open the fly shop.
 */
function CampaignPreview({
  row,
  dark,
  surface,
  selectedElementId,
  onSelectElement,
  onSignal,
  onContents,
}: {
  row: CampaignRow;
  dark: boolean;
  surface: PreviewSurface;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onSignal: (signal: RiveSignal) => void;
  onContents: (contents: RiveContents) => void;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const payload = useMemo(() => toPayload(row), [row]);
  const blocking = isBlockingTemplate(row.template);

  const describe = (label: string) => {
    setOutcome(label);
    window.setTimeout(() => setOutcome(null), 1600);
  };

  const handleSignal = (signal: RiveSignal) => {
    onSignal(signal);
    const resolved = resolveRiveSignal(row, signal);
    describe(
      resolved
        ? `"${signal.name}" → ${CTA_LABELS[resolved.action]}`
        : `"${signal.name || 'unnamed'}" — not mapped`,
    );
  };

  const artKey = `${payload.riveUrl}|${row.rive.artboard}|${row.rive.stateMachine}`;

  const modal = (
    <CampaignCanvasView
      key={artKey}
      campaign={payload}
      selectedId={selectedElementId}
      onSelectElement={onSelectElement}
      onActivate={(element) =>
        describe(`${element.label || element.type} → ${CTA_LABELS[element.action ?? 'dismiss']}`)
      }
      onDismiss={() => describe('Closes')}
      onSignal={handleSignal}
      onRiveContents={onContents}
    />
  );

  const banner = (
    <NudgeBannerCard
      key={artKey}
      campaign={payload}
      onCta={() => describe(CTA_LABELS[row.cta.action])}
      onDismiss={() => describe('Closes')}
      onSignal={handleSignal}
      onRiveContents={onContents}
    />
  );

  const toast = outcome ? (
    <div className="absolute inset-x-4 top-14 z-10 mx-auto max-w-xs rounded-xl bg-foreground/90 px-3 py-2 text-center text-[11px] font-black text-background">
      {outcome}
    </div>
  ) : null;

  // On the web the same campaign is a centred dialog, not a bottom sheet —
  // the one place where "it looked fine on my phone" goes wrong.
  if (surface === 'web') {
    return (
      <div className={dark ? 'dark' : undefined}>
        <div className="relative h-[560px] w-[720px] overflow-hidden rounded-2xl bg-background ring-1 ring-border">
          <div className="flex h-9 items-center gap-1.5 border-b border-border bg-muted/60 px-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 h-5 flex-1 rounded-md bg-background/70" />
          </div>
          <div className="absolute inset-x-0 bottom-0 top-9 bg-gradient-to-b from-emerald-500/10 to-sky-500/5" />

          {blocking ? (
            <div className="absolute inset-x-0 bottom-0 top-9 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
              {modal}
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-6 mx-auto max-w-md px-3">{banner}</div>
          )}
          {toast}
        </div>
      </div>
    );
  }

  return (
    <div className={dark ? 'dark' : undefined}>
      <div className="relative h-[640px] w-[320px] overflow-hidden rounded-[38px] bg-background ring-[6px] ring-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-sky-500/5" />
        <div className="absolute inset-x-0 top-0 flex h-11 items-center justify-center">
          <span className="h-1.5 w-20 rounded-full bg-foreground/15" />
        </div>

        {blocking ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
            {modal}
          </div>
        ) : (
          <div className="absolute inset-x-3 bottom-24">{banner}</div>
        )}

        {toast}
      </div>
    </div>
  );
}

/** What each element on the artwork actually got pressed, per campaign. */
function ElementAnalytics({
  campaignId,
  elements,
  stats,
  impressions,
}: {
  campaignId: string;
  elements: CampaignPayload['canvas']['elements'];
  stats: ElementStat[];
  impressions: number;
}) {
  const clickable = elements.filter((element) => isClickableElement(element.type));
  if (!clickable.length) return null;

  const byId = new Map(
    stats.filter((row) => row.campaignId === campaignId).map((row) => [row.elementId, row.clicks]),
  );

  return (
    <div className="space-y-1 rounded-xl bg-muted/50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        Per element · {impressions} impressions
      </p>
      {clickable.map((element) => {
        const clicks = byId.get(element.id) ?? 0;
        const rate = impressions ? Math.round((clicks / impressions) * 100) : 0;
        return (
          <div key={element.id} className="flex items-center gap-2 text-xs font-bold">
            <span className="min-w-0 flex-1 truncate">
              {element.label || ELEMENT_LABELS[element.type]}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {clicks} clicks · {impressions ? `${rate}%` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Hint({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={className}>{children}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs font-semibold">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="rounded-xl bg-muted/30 p-3">
      <summary className="cursor-pointer select-none text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  /** Renders a ? next to the label, explaining the field on hover. */
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
        {help ? (
          <Hint text={help}>
            <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-muted-foreground/20 text-[9px] font-black text-muted-foreground">
              ?
            </span>
          </Hint>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="input"
      />
    </Field>
  );
}
