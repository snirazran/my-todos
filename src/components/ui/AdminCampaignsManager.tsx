'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronLeft,
  Copy,
  Eye,
  Info,
  LayoutList,
  Lightbulb,
  Loader2,
  Monitor,
  Moon,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Smartphone,
  Sun,
  Trash2,
  Undo2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NudgeBannerCard } from '@/components/campaigns/CampaignSurfaces';
import { CampaignCanvasView } from '@/components/campaigns/CampaignCanvasView';
import {
  CampaignCanvasEditor,
  CanvasAssets,
} from '@/components/ui/admin/CampaignCanvasEditor';
import {
  riveSourceKey,
  type RiveContents,
  type RiveSignal,
} from '@/components/campaigns/CampaignRiveArt';
import { resolveRiveSignal } from '@/lib/campaigns/riveSignals';
import { reviewCampaign, type ReviewNote } from '@/lib/campaigns/review';
import { ActionPicker, type ActionEnv } from '@/components/ui/admin/campaigns/ActionPicker';
import { RiveStudio } from '@/components/ui/admin/campaigns/RiveStudio';
import type { RewardCatalogEntry } from '@/components/ui/admin/campaigns/RewardEditor';
import type { StoreProductRow } from '@/components/ui/admin/campaigns/StoreProductPicker';
import {
  EmptyState,
  Field,
  NumberInput,
  Panel,
  SegmentedControl,
  Select,
  Slider,
  TextInput,
  Toggle,
  usePanels,
} from '@/components/ui/admin/campaigns/primitives';
import type {
  CampaignRow,
  CampaignStats,
  ElementStat,
  ExplainRow,
  RiveLibraryFile,
} from '@/components/ui/admin/campaigns/types';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
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
  ELEMENT_LABELS,
  isClickableElement,
  CTA_LABELS,
  TEMPLATE_HELP,
  TEMPLATE_LABELS,
  TIER_HELP,
  TIER_LABELS,
  TIER_SYSTEM_HELP,
  TRIGGER_HELP,
  TRIGGER_LABELS,
  TRIGGER_OPTIONS,
  isBlockingTemplate,
  type CampaignCanvas,
  type CampaignPayload,
  type CampaignRive,
  type CampaignRiveButton,
  type CampaignStatus,
  type CampaignTemplate,
  type CampaignTrigger,
  type CampaignTriggerRule,
  type RiveSignalSource,
  type SignalAction,
} from '@/lib/campaigns/types';

type PreviewSurface = 'phone' | 'web';
type Pane = 'list' | 'edit' | 'preview';
type Tab = 'design' | 'rules' | 'audience' | 'launch';

type SeenSignal = {
  name: string;
  source: RiveSignalSource;
  count: number;
};

type Toast = { id: number; kind: 'ok' | 'error'; text: string };

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'design', label: 'Design', hint: 'What it looks like and what its buttons do' },
  { key: 'rules', label: 'Rules', hint: 'When it fires, how often, and for how long' },
  { key: 'audience', label: 'Audience', hint: 'Who is eligible to see it' },
  { key: 'launch', label: 'Launch', hint: 'Checks, status and results' },
];

const STATUS_STYLES: Record<CampaignStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  test: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  paused: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  draft: 'bg-muted text-muted-foreground',
};

const STATUS_HELP: Record<CampaignStatus, string> = {
  draft: 'Invisible to everyone. Work on it freely.',
  test: 'Visible to admin accounts only — the safe way to see it in the real app.',
  live: 'Visible to everyone the audience rules allow.',
  paused: 'Stops showing, but keeps all its history and stats.',
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
  offer: { packId: '', productId: '', bonusLabel: '' },
  rive: { ...DEFAULT_RIVE, buttons: [], inputs: [], tickers: [] },
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

const toLocalInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  // datetime-local wants wall-clock time; an ISO slice would show UTC and
  // quietly shift every schedule by the timezone offset.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

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

const normalise = (item: Partial<CampaignRow>): CampaignRow => ({
  ...blank(),
  ...item,
  copy: { ...DEFAULT_COPY, ...(item.copy ?? {}) },
  cta: { action: 'dismiss', path: '', ...(item.cta ?? {}) },
  offer: { packId: '', productId: '', bonusLabel: '', ...(item.offer ?? {}) },
  targeting: { ...DEFAULT_TARGETING, ...(item.targeting ?? {}) },
  caps: { ...DEFAULT_CAPS, ...(item.caps ?? {}) },
  rive: {
    ...DEFAULT_RIVE,
    ...(item.rive ?? {}),
    buttons: item.rive?.buttons ?? [],
    inputs: item.rive?.inputs ?? [],
    tickers: item.rive?.tickers ?? [],
  },
  canvas: {
    ...DEFAULT_CANVAS,
    ...(item.canvas ?? {}),
    elements: item.canvas?.elements ?? [],
  },
  assets: item.assets ?? [],
});

export function AdminCampaignsManager() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [stats, setStats] = useState<CampaignStats[]>([]);
  const [elementStats, setElementStats] = useState<ElementStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<CampaignRow | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [past, setPast] = useState<CampaignRow[]>([]);
  const [future, setFuture] = useState<CampaignRow[]>([]);
  const lastPushRef = useRef(0);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [tab, setTab] = useState<Tab>('design');
  const [pane, setPane] = useState<Pane>('edit');
  const [listOpen, setListOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);

  const [explainEmail, setExplainEmail] = useState('');
  const [explain, setExplain] = useState<{
    audience: Record<string, unknown>;
    results: ExplainRow[];
  } | null>(null);
  const [explaining, setExplaining] = useState(false);

  const [library, setLibrary] = useState<RiveLibraryFile[]>([]);
  const [products, setProducts] = useState<StoreProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [catalog, setCatalog] = useState<RewardCatalogEntry[]>([]);

  // Keyed by file: the canvas preview and the right-hand preview both load
  // every animation, and a single slot would show whichever finished last.
  const [contents, setContents] = useState<Record<string, RiveContents>>({});
  const [seen, setSeen] = useState<SeenSignal[]>([]);
  const [signalLog, setSignalLog] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [surface, setSurface] = useState<PreviewSurface>('phone');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const panels = usePanels(['artwork', 'elements', 'triggers', 'caps']);
  const riveUploadRef = useRef<HTMLInputElement>(null);

  const statById = useMemo(() => new Map(stats.map((s) => [s._id, s])), [stats]);
  const dirty = !!draft && JSON.stringify(draft) !== saved;

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, text }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      kind === 'error' ? 6000 : 3000,
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/campaigns', { credentials: 'include' });
      if (!res.ok) throw new Error(`Server said ${res.status}`);
      const data = await res.json();
      setRows((data.items ?? []).map(normalise));
      setStats(data.stats ?? []);
      setElementStats(data.elementStats ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load campaigns',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch('/api/admin/campaigns/store-products', {
        credentials: 'include',
      });
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    fetch('/api/admin/campaigns/rive-library', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setLibrary(d.files ?? []))
      .catch(() => {});
    fetch('/api/admin/campaigns/reward-catalog', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCatalog(d.entries ?? []))
      .catch(() => {});
  }, [loadProducts]);

  const editingId = draft?.id ?? null;
  useEffect(() => {
    setSeen([]);
    setSignalLog([]);
    setContents({});
    setSelectedElementId(null);
  }, [editingId]);

  // Nothing here autosaves, so leaving with unsaved work has to be the user's
  // explicit choice rather than a surprise.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const openDraft = useCallback(
    (row: CampaignRow | null) => {
      if (dirty && !window.confirm('Discard unsaved changes?')) return;
      setPast([]);
      setFuture([]);
      lastPushRef.current = 0;
      setDraft(row);
      setSaved(row ? JSON.stringify(row) : '');
      setTab('design');
      setPane('edit');
    },
    [dirty],
  );

  /**
   * Undo coalesces rapid edits: dragging a slider is one gesture, so it should
   * be one step back, not forty.
   */
  const patch = useCallback(
    (partial: Partial<CampaignRow>) =>
      setDraft((current) => {
        if (!current) return current;
        const now = Date.now();
        if (now - lastPushRef.current > 500) {
          setPast((stack) => [...stack.slice(-49), current]);
          setFuture([]);
          lastPushRef.current = now;
        }
        return { ...current, ...partial };
      }),
    [],
  );

  const patchRive = useCallback(
    (partial: Partial<CampaignRive>) =>
      setDraft((current) =>
        current ? { ...current, rive: { ...current.rive, ...partial } } : current,
      ),
    [],
  );

  const patchCanvas = useCallback(
    (partial: Partial<CampaignCanvas>) =>
      setDraft((current) =>
        current ? { ...current, canvas: { ...current.canvas, ...partial } } : current,
      ),
    [],
  );

  const undo = useCallback(() => {
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setDraft((current) => {
        if (current) setFuture((forward) => [current, ...forward]);
        return previous;
      });
      lastPushRef.current = 0;
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (!stack.length) return stack;
      const next = stack[0];
      setDraft((current) => {
        if (current) setPast((back) => [...back, current]);
        return next;
      });
      lastPushRef.current = 0;
      return stack.slice(1);
    });
  }, []);

  const save = useCallback(async () => {
    const current = draft;
    if (!current || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: current.id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      const data = await res.json();
      if (!res.ok) {
        toast('error', data.error ?? 'Save failed');
        if (Array.isArray(data.blockers) && data.blockers.length) setTab('launch');
        return;
      }
      await load();
      const next = normalise({
        ...data.item,
        imageUrl: current.imageUrl,
        riveUploadUrl: current.riveUploadUrl,
      });
      setDraft(next);
      setSaved(JSON.stringify(next));
      setPast([]);
      setFuture([]);
      toast('ok', current.id ? 'Saved.' : `Created "${next.name}".`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, load, saving, toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void save();
        return;
      }
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable) return;
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, save, undo]);

  const clone = async (id: string) => {
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneOf: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast('error', data.error ?? 'Duplicate failed');
      return;
    }
    await load();
    toast('ok', `Duplicated as "${data.item.name}" — it starts as a draft.`);
  };

  const remove = async (id: string) => {
    const res = await fetch('/api/admin/campaigns', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      toast('error', 'Delete failed');
      return;
    }
    if (draft?.id === id) {
      setDraft(null);
      setSaved('');
    }
    setConfirmDelete(null);
    await load();
    toast('ok', 'Deleted, along with its artwork and history.');
  };

  const upload = async (file: File, kind: 'background' | 'asset' | 'rive') => {
    if (!draft?.id) {
      toast('error', 'Save the campaign first, then add art.');
      return;
    }
    if (dirty) {
      toast('error', 'Save your changes first — an upload reloads the campaign.');
      return;
    }
    setUploading(kind);
    try {
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
        toast('error', data.error ?? 'Upload failed');
        return;
      }
      setDraft((current) => {
        if (!current) return current;
        const next =
          kind === 'background'
            ? {
                ...current,
                imageUrl: data.url,
                // The canvas takes the shape of the artwork, so nothing has to
                // be measured by hand.
                canvas: data.aspect
                  ? {
                      ...current.canvas,
                      aspect: Math.min(3, Math.max(0.3, data.aspect)),
                    }
                  : current.canvas,
              }
            : { ...current, assets: [...current.assets, data.asset] };
        setSaved(JSON.stringify(next));
        return next;
      });
      await load();
      toast('ok', kind === 'background' ? 'Artwork updated.' : 'File added.');
    } finally {
      setUploading(null);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!draft?.id) return;
    const used = draft.canvas.elements.filter((element) => element.assetId === assetId);
    if (
      used.length &&
      !window.confirm(
        `${used.length} element${used.length > 1 ? 's' : ''} still use this file. Delete anyway?`,
      )
    ) {
      return;
    }
    await fetch('/api/admin/campaigns/upload', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draft.id, assetId }),
    });
    setDraft((current) => {
      if (!current) return current;
      const next = {
        ...current,
        assets: current.assets.filter((asset) => asset.id !== assetId),
      };
      setSaved(JSON.stringify(next));
      return next;
    });
    await load();
  };

  const resetMyState = async () => {
    if (!draft?.id) return;
    const res = await fetch('/api/admin/campaigns/reset', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: draft.id,
        email: explainEmail.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast('error', data.error ?? 'Reset failed');
      return;
    }
    toast(
      'ok',
      data.cleared
        ? 'History cleared — this campaign can show again.'
        : 'Nothing to clear; that account had not seen it.',
    );
  };

  const runExplain = async () => {
    setExplaining(true);
    try {
      const params = new URLSearchParams();
      if (explainEmail.trim()) params.set('email', explainEmail.trim());
      const res = await fetch(`/api/admin/campaigns/explain?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast('error', data.error ?? 'Dry run failed');
        return;
      }
      setExplain(data);
    } finally {
      setExplaining(false);
    }
  };

  const registerProduct = useCallback(
    async (product: {
      productId: string;
      label: string;
      store: StoreProductRow['store'];
      kind: StoreProductRow['kind'];
      priceHint: string;
    }) => {
      const res = await fetch('/api/admin/campaigns/store-products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      const data = await res.json();
      if (!res.ok) {
        toast('error', data.error ?? 'Could not register that product');
        return;
      }
      await loadProducts();
      toast('ok', `${product.productId} is now pickable.`);
    },
    [loadProducts, toast],
  );

  const archiveProduct = useCallback(
    async (productId: string) => {
      await fetch('/api/admin/campaigns/store-products', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      await loadProducts();
    },
    [loadProducts],
  );

  const actionEnv: ActionEnv = useMemo(
    () => ({
      products,
      productsLoading,
      catalog,
      registerProduct,
      archiveProduct,
    }),
    [archiveProduct, catalog, products, productsLoading, registerProduct],
  );

  const onRiveContents = useCallback((next: RiveContents) => {
    setContents((current) =>
      JSON.stringify(current[next.source]) === JSON.stringify(next)
        ? current
        : { ...current, [next.source]: next },
    );
  }, []);

  const onRiveSignal = useCallback((signal: RiveSignal) => {
    setSeen((current) => {
      const index = current.findIndex(
        (item) => item.name === signal.name && item.source === signal.source,
      );
      if (index === -1) {
        return [...current, { name: signal.name, source: signal.source, count: 1 }];
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

  const mapSignal = (signal: SeenSignal) =>
    setDraft((current) => {
      if (!current) return current;
      if (
        current.rive.buttons.some(
          (button) => button.signal === signal.name && button.source === signal.source,
        )
      ) {
        return current;
      }
      const button: CampaignRiveButton = {
        signal: signal.name,
        source: signal.source,
        action: 'cta',
        path: '',
        packId: '',
        productId: '',
        closes: true,
      };
      return { ...current, rive: { ...current.rive, buttons: [...current.rive.buttons, button] } };
    });

  const patchButton = (index: number, partial: Partial<CampaignRiveButton>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            rive: {
              ...current.rive,
              buttons: current.rive.buttons.map((button, i) =>
                i === index ? { ...button, ...partial } : button,
              ),
            },
          }
        : current,
    );

  const preview = useMemo(() => toPayload(draft ?? blank()), [draft]);
  const notes = useMemo(() => (draft ? reviewCampaign(draft) : []), [draft]);
  const errors = notes.filter((note) => note.level === 'error');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle) ||
        row.triggers.some((rule) => TRIGGER_LABELS[rule.event].toLowerCase().includes(needle))
      );
    });
  }, [query, rows, statusFilter]);

  const jumpToNote = (note: ReviewNote) => {
    if (note.elementId) {
      setSelectedElementId(note.elementId);
      setTab('design');
      panels.openPanel('elements');
      setPane('edit');
      return;
    }
    setTab(/rollout|audience|account|Flies/.test(note.message) ? 'audience' : 'rules');
  };

  return (
    <div className="min-h-screen bg-background">
      <input
        ref={riveUploadRef}
        type="file"
        accept=".riv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file, 'rive');
          event.target.value = '';
        }}
      />

      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[120rem] flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/admin"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to admin"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">
              Popups &amp; offers
            </h1>
            <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">
              Design a popup, say when it fires — the app decides who actually sees it.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {draft ? (
              <>
                <IconButton
                  label="Undo (⌘Z)"
                  disabled={!past.length}
                  onClick={undo}
                  icon={<Undo2 className="h-4 w-4" />}
                />
                <IconButton
                  label="Redo (⇧⌘Z)"
                  disabled={!future.length}
                  onClick={redo}
                  icon={<Redo2 className="h-4 w-4" />}
                />
                <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              className="hidden h-9 items-center gap-1.5 rounded-xl bg-muted px-3 text-xs font-black lg:flex"
            >
              {listOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
              {rows.length}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen((open) => !open)}
              className={cn(
                'hidden h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-black lg:flex',
                previewOpen ? 'bg-foreground text-background' : 'bg-muted',
              )}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => openDraft(blank())}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          </div>

          {/* On a phone the three panes are one at a time; there is no width to
              put them side by side without making all three useless. */}
          <div className="w-full lg:hidden">
            <SegmentedControl
              size="sm"
              value={pane}
              onChange={setPane}
              options={[
                { value: 'list', label: <><LayoutList className="h-3 w-3" /> Campaigns</> },
                { value: 'edit', label: <><Pencil className="h-3 w-3" /> Edit</> },
                { value: 'preview', label: <><Eye className="h-3 w-3" /> Preview</> },
              ]}
            />
          </div>
        </div>

        {dirty ? (
          <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-1.5 text-[11px] font-black text-amber-600 dark:text-amber-400 sm:px-6">
            <AlertTriangle className="h-3.5 w-3.5" />
            Unsaved changes
            <button
              type="button"
              onClick={() => void save()}
              className="ml-auto rounded-lg bg-amber-500/20 px-2 py-0.5 font-black"
            >
              Save now (⌘S)
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-[120rem] px-4 py-4 sm:px-6">
        <div
          className={cn(
            'grid gap-4',
            listOpen && previewOpen && draft
              ? 'lg:grid-cols-[19rem_minmax(0,1fr)_auto]'
              : listOpen
                ? 'lg:grid-cols-[19rem_minmax(0,1fr)]'
                : previewOpen && draft
                  ? 'lg:grid-cols-[minmax(0,1fr)_auto]'
                  : 'lg:grid-cols-1',
          )}
        >
          <aside
            className={cn(
              'min-w-0 space-y-2',
              pane === 'list' ? 'block' : 'hidden',
              listOpen ? 'lg:block' : 'lg:hidden',
            )}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search campaigns…"
                className="h-10 w-full rounded-xl bg-muted pl-9 pr-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <SegmentedControl
              size="sm"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all' as const, label: 'All' },
                ...CAMPAIGN_STATUSES.map((status) => ({
                  value: status,
                  label: status,
                })),
              ]}
            />

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}

            {loadError ? (
              <div className="rounded-xl bg-red-500/10 p-3">
                <p className="text-xs font-black text-red-500">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-1 text-[11px] font-black text-red-500 underline"
                >
                  Try again
                </button>
              </div>
            ) : null}

            {filtered.map((row) => {
              const stat = statById.get(row.id);
              const impressions = stat?.impressions ?? 0;
              const rate = (value: number) =>
                impressions ? `${Math.round((value / impressions) * 100)}%` : '—';
              return (
                <div
                  key={row.id}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-2xl bg-card p-2.5 text-left ring-1 transition-all',
                    draft?.id === row.id
                      ? 'ring-2 ring-primary'
                      : 'ring-border hover:ring-foreground/20',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openDraft(row)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Thumb row={row} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-black">
                          {row.name || 'Untitled'}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black',
                            STATUS_STYLES[row.status],
                          )}
                        >
                          {row.status}
                        </span>
                        {row.targeting.rollout < 100 ? (
                          <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-black text-sky-600 dark:text-sky-400">
                            {row.targeting.rollout}%
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                        {TEMPLATE_LABELS[row.template].split('—')[0].trim()} ·{' '}
                        {row.triggers.map((t) => TRIGGER_LABELS[t.event]).join(', ') ||
                          'no triggers'}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] font-bold tabular-nums text-muted-foreground">
                        {impressions} shown · {rate(stat?.clicks ?? 0)} tapped ·{' '}
                        {stat?.conversions ?? 0} converted
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton
                      label="Duplicate"
                      small
                      onClick={() => void clone(row.id)}
                      icon={<Copy className="h-3.5 w-3.5" />}
                    />
                    <IconButton
                      label={confirmDelete === row.id ? 'Tap again to delete' : 'Delete'}
                      small
                      danger
                      active={confirmDelete === row.id}
                      onClick={() =>
                        confirmDelete === row.id
                          ? void remove(row.id)
                          : setConfirmDelete(row.id)
                      }
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                    />
                  </div>
                </div>
              );
            })}

            {!loading && !filtered.length ? (
              <EmptyState
                icon={<LayoutList className="h-8 w-8" />}
                title={rows.length ? 'Nothing matches' : 'No campaigns yet'}
                body={
                  rows.length
                    ? 'Try a different search or status filter.'
                    : 'A campaign is one popup, plus the rules for when it appears and who sees it.'
                }
                action={
                  rows.length ? null : (
                    <button
                      type="button"
                      onClick={() => openDraft(blank())}
                      className="mt-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
                    >
                      Design the first one
                    </button>
                  )
                }
              />
            ) : null}
          </aside>

          <main className={cn('min-w-0', pane === 'edit' ? 'block' : 'hidden', 'lg:block')}>
            {!draft ? (
              <EmptyState
                icon={<Wand2 className="h-8 w-8" />}
                title="Pick a campaign, or start a new one"
                body="Everything about one popup lives here: its artwork, what its buttons do, when it fires, and who it reaches."
                action={
                  <button
                    type="button"
                    onClick={() => openDraft(blank())}
                    className="mt-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
                  >
                    New campaign
                  </button>
                }
              />
            ) : (
              <div className="space-y-3 rounded-2xl bg-card p-3 ring-1 ring-border sm:p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={draft.name}
                      onChange={(event) => patch({ name: event.target.value })}
                      placeholder="Name this campaign"
                      className="w-full bg-transparent text-base font-black outline-none placeholder:text-muted-foreground/60"
                    />
                    <p className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
                      {draft.id ? (
                        <span className="font-mono">{draft.id}</span>
                      ) : (
                        'Not saved yet — the id is made from the name'
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-1 text-[11px] font-black',
                      STATUS_STYLES[draft.status],
                    )}
                  >
                    {draft.status}
                  </span>
                  <IconButton
                    label="Close editor"
                    onClick={() => openDraft(null)}
                    icon={<X className="h-4 w-4" />}
                  />
                </div>

                <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-0.5">
                  {TABS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setTab(item.key)}
                      title={item.hint}
                      className={cn(
                        'flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-xs font-black transition-colors',
                        tab === item.key
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {item.label}
                      {item.key === 'launch' && errors.length ? (
                        <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                          {errors.length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] font-medium text-muted-foreground">
                  {TABS.find((item) => item.key === tab)?.hint}
                </p>

                {tab === 'design' ? (
                  <DesignTab
                    draft={draft}
                    preview={preview}
                    panels={panels}
                    uploading={uploading}
                    contents={contents}
                    library={library}
                    actionEnv={actionEnv}
                    seen={seen}
                    dark={dark}
                    selectedElementId={selectedElementId}
                    onSelectElement={setSelectedElementId}
                    onPatch={patch}
                    onPatchCanvas={patchCanvas}
                    onPatchRive={patchRive}
                    onPatchButton={patchButton}
                    onMapSignal={mapSignal}
                    onUpload={(file, kind) => void upload(file, kind)}
                    onDeleteAsset={(assetId) => void deleteAsset(assetId)}
                    onPickRiveUpload={() => riveUploadRef.current?.click()}
                    onSignal={onRiveSignal}
                    onRiveContents={onRiveContents}
                  />
                ) : null}

                {tab === 'rules' ? <RulesTab draft={draft} panels={panels} onPatch={patch} /> : null}

                {tab === 'audience' ? <AudienceTab draft={draft} onPatch={patch} /> : null}

                {tab === 'launch' ? (
                  <LaunchTab
                    draft={draft}
                    notes={notes}
                    stat={statById.get(draft.id)}
                    elementStats={elementStats}
                    explain={explain}
                    explainEmail={explainEmail}
                    explaining={explaining}
                    onExplainEmail={setExplainEmail}
                    onRunExplain={() => void runExplain()}
                    onResetState={() => void resetMyState()}
                    onPatch={patch}
                    onJumpToNote={jumpToNote}
                  />
                ) : null}

                <div className="sticky bottom-3 flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !dirty}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-lg transition-opacity disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : dirty ? (
                      'Save campaign'
                    ) : (
                      'Saved'
                    )}
                  </button>
                  {draft.id ? (
                    <button
                      type="button"
                      onClick={() => void resetMyState()}
                      title="Clear this account's history so the popup can show again"
                      className="flex h-12 items-center gap-1.5 rounded-2xl bg-muted px-4 text-sm font-black shadow-lg"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="hidden sm:inline">Let me see it again</span>
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </main>

          {draft ? (
            <aside
              className={cn(
                'min-w-0',
                pane === 'preview' ? 'block' : 'hidden',
                previewOpen ? 'lg:block' : 'lg:hidden',
                'lg:sticky lg:top-24 lg:self-start',
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                  Live preview
                </p>
                <div className="ml-auto flex gap-1">
                  <SegmentedControl
                    size="sm"
                    value={surface}
                    onChange={setSurface}
                    options={[
                      { value: 'phone', label: <Smartphone className="h-3.5 w-3.5" />, title: 'Phone' },
                      { value: 'web', label: <Monitor className="h-3.5 w-3.5" />, title: 'Web' },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => setDark((value) => !value)}
                    aria-label={dark ? 'Preview in light mode' : 'Preview in dark mode'}
                    className="flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[11px] font-black"
                  >
                    {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
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

              <p className="mt-2 text-[10px] font-medium leading-snug text-muted-foreground">
                Buttons here describe what they would do instead of doing it — nothing is
                charged, granted or navigated from the preview.
              </p>

              {signalLog.length ? (
                <div className="mt-2 rounded-xl bg-card p-2.5 ring-1 ring-border">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                    Signals seen
                  </p>
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
            </aside>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-xl px-3 py-2.5 text-xs font-black shadow-lg',
              item.kind === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-foreground text-background',
            )}
          >
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Thumb({ row }: { row: CampaignRow }) {
  if (row.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={row.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
    );
  }
  const animated = row.canvas.elements.some((element) => element.type === 'rive');
  return (
    <span
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
        animated
          ? 'bg-violet-500/15 text-violet-500'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <Zap className="h-4.5 w-4.5" />
    </span>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
  active,
  small,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-30',
        small ? 'h-6 w-6' : 'h-9 w-9',
        active
          ? 'bg-red-500 text-white'
          : danger
            ? 'hover:bg-red-500/10 hover:text-red-500'
            : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}

type PanelApi = ReturnType<typeof usePanels>;

function DesignTab({
  draft,
  preview,
  panels,
  uploading,
  contents,
  library,
  actionEnv,
  seen,
  dark,
  selectedElementId,
  onSelectElement,
  onPatch,
  onPatchCanvas,
  onPatchRive,
  onPatchButton,
  onMapSignal,
  onUpload,
  onDeleteAsset,
  onPickRiveUpload,
  onSignal,
  onRiveContents,
}: {
  draft: CampaignRow;
  preview: CampaignPayload;
  panels: PanelApi;
  uploading: string | null;
  contents: Record<string, RiveContents>;
  library: RiveLibraryFile[];
  actionEnv: ActionEnv;
  seen: SeenSignal[];
  dark: boolean;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onPatch: (partial: Partial<CampaignRow>) => void;
  onPatchCanvas: (partial: Partial<CampaignCanvas>) => void;
  onPatchRive: (partial: Partial<CampaignRive>) => void;
  onPatchButton: (index: number, partial: Partial<CampaignRiveButton>) => void;
  onMapSignal: (signal: SeenSignal) => void;
  onUpload: (file: File, kind: 'background' | 'asset' | 'rive') => void;
  onDeleteAsset: (assetId: string) => void;
  onPickRiveUpload: () => void;
  onSignal: (signal: RiveSignal) => void;
  onRiveContents: (contents: RiveContents) => void;
}) {
  const isCanvas = draft.template === 'canvas';
  const hasRiveElement = draft.canvas.elements.some((element) => element.type === 'rive');

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Format" help={TEMPLATE_HELP[draft.template]}>
          <Select
            value={draft.template}
            options={CAMPAIGN_TEMPLATES.map((template) => ({
              value: template,
              label: TEMPLATE_LABELS[template],
            }))}
            onChange={(template) => onPatch({ template: template as CampaignTemplate })}
          />
        </Field>
        <Field label="Status" help={STATUS_HELP[draft.status]}>
          <Select
            value={draft.status}
            options={CAMPAIGN_STATUSES.map((status) => ({
              value: status,
              label: `${status} — ${STATUS_HELP[status].split('.')[0]}`,
            }))}
            onChange={(status) => onPatch({ status })}
          />
        </Field>
      </div>

      <p className="rounded-xl bg-muted/40 px-3 py-2 text-[11px] font-medium leading-snug text-muted-foreground">
        {TEMPLATE_HELP[draft.template]}{' '}
        <span className="font-black text-foreground">
          {isBlockingTemplate(draft.template)
            ? 'At most one takeover per session, across every campaign.'
            : 'Never blocks what the user is doing.'}
        </span>
      </p>

      <Panel
        title="Artwork"
        subtitle={draft.imageUrl ? 'Uploaded' : 'Nothing uploaded yet'}
        open={panels.isOpen('artwork')}
        onToggle={() => panels.toggle('artwork')}
      >
        <CanvasAssets
          campaign={preview}
          canUpload={!!draft.id}
          canvas={isCanvas}
          uploading={uploading}
          onUpload={onUpload}
          onDeleteAsset={onDeleteAsset}
        />
        {isCanvas ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Slider
              label="Popup width"
              value={draft.canvas.maxWidth}
              min={240}
              max={720}
              step={4}
              suffix="px"
              help="How wide the popup gets on the biggest screens. Everything on it scales together."
              onChange={(maxWidth) => onPatchCanvas({ maxWidth })}
            />
            <Slider
              label="Shape"
              value={draft.canvas.aspect}
              min={0.3}
              max={3}
              step={0.01}
              help="Width ÷ height. Uploading artwork sets this to match the file."
              onChange={(aspect) => onPatchCanvas({ aspect })}
            />
          </div>
        ) : null}
      </Panel>

      {isCanvas ? (
        <Panel
          title="Elements"
          subtitle={`${draft.canvas.elements.length} on the artwork`}
          open={panels.isOpen('elements')}
          onToggle={() => panels.toggle('elements')}
        >
          <CampaignCanvasEditor
            campaign={preview}
            canvas={draft.canvas}
            selectedId={selectedElementId}
            onSelect={onSelectElement}
            onChange={(canvas) => onPatch({ canvas })}
            onSignal={onSignal}
            onRiveContents={onRiveContents}
            riveContents={contents}
            library={library}
            actionEnv={actionEnv}
            onUploadRive={onPickRiveUpload}
            canUpload={!!draft.id}
            dark={dark}
          />
        </Panel>
      ) : (
        <Panel
          title="Copy &amp; button"
          subtitle={draft.copy.headline || 'No headline yet'}
          open={panels.isOpen('copy')}
          onToggle={() => panels.toggle('copy')}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Eyebrow">
              <TextInput
                value={draft.copy.eyebrow}
                onChange={(eyebrow) => onPatch({ copy: { ...draft.copy, eyebrow } })}
              />
            </Field>
            <Field label="Headline">
              <TextInput
                value={draft.copy.headline}
                onChange={(headline) => onPatch({ copy: { ...draft.copy, headline } })}
              />
            </Field>
          </div>
          <Field label="Body">
            <textarea
              value={draft.copy.body}
              onChange={(event) =>
                onPatch({ copy: { ...draft.copy, body: event.target.value } })
              }
              rows={2}
              className="w-full rounded-xl bg-muted px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Button label">
              <TextInput
                value={draft.copy.ctaLabel}
                onChange={(ctaLabel) => onPatch({ copy: { ...draft.copy, ctaLabel } })}
              />
            </Field>
            <Field label="Dismiss label">
              <TextInput
                value={draft.copy.dismissLabel}
                onChange={(dismissLabel) =>
                  onPatch({ copy: { ...draft.copy, dismissLabel } })
                }
              />
            </Field>
          </div>

          <ActionPicker
            config={draft.cta}
            env={actionEnv}
            label="The button does"
            onChange={(partial) => onPatch({ cta: { ...draft.cta, ...partial } })}
          />

          <Panel
            title="Animation instead of an image"
            subtitle={draft.rive.libraryPath || 'Optional'}
            open={panels.isOpen('banner-rive')}
            onToggle={() => panels.toggle('banner-rive')}
          >
            <RiveStudio
              spec={draft.rive}
              contents={
                contents[
                  riveSourceKey(
                    draft.rive.libraryPath || draft.riveUploadUrl,
                    draft.rive.artboard,
                    draft.rive.stateMachine,
                  )
                ] ?? null
              }
              library={library}
              assets={draft.assets.filter((asset) => asset.kind === 'rive')}
              canUpload={!!draft.id}
              onUploadRive={onPickRiveUpload}
              onPatch={(partial) => {
                onPatchRive(partial);
                if (partial.libraryPath !== undefined) {
                  onPatch({ art: partial.libraryPath ? 'rive' : 'image' });
                }
              }}
            />
          </Panel>
        </Panel>
      )}

      {hasRiveElement || draft.art === 'rive' ? (
        <Panel
          title="Buttons drawn inside Rive"
          subtitle={`${draft.rive.buttons.length} mapped`}
          open={panels.isOpen('rive-buttons')}
          onToggle={() => panels.toggle('rive-buttons')}
        >
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            Click the animation in the preview. Every Rive Event it fires appears here — map one
            and it behaves exactly like a button drawn in the app. Data-bound triggers can&apos;t
            be discovered, so add those by name.
          </p>

          {seen.length ? (
            <div className="flex flex-wrap gap-1.5">
              {seen.map((signal) => {
                const mapped = draft.rive.buttons.some(
                  (button) =>
                    button.signal === signal.name && button.source === signal.source,
                );
                return (
                  <button
                    key={`${signal.source}:${signal.name}`}
                    type="button"
                    disabled={mapped}
                    onClick={() => onMapSignal(signal)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black',
                      mapped
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-violet-500/15 text-violet-600 hover:bg-violet-500/25 dark:text-violet-400',
                    )}
                  >
                    <MousePointerClick className="h-3 w-3" />
                    {signal.name || '(unnamed)'} ×{signal.count}
                    {mapped ? ' · mapped' : ' · map it'}
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
                  <TextInput
                    value={button.signal}
                    placeholder="signal name"
                    onChange={(signal) => onPatchButton(index, { signal })}
                  />
                  <Select
                    className="w-40 shrink-0"
                    value={button.source}
                    options={RIVE_SIGNAL_SOURCES.map((source) => ({
                      value: source,
                      label: RIVE_SIGNAL_SOURCE_LABELS[source],
                    }))}
                    onChange={(source) => onPatchButton(index, { source })}
                  />
                  <IconButton
                    label="Remove"
                    small
                    danger
                    onClick={() =>
                      onPatchRive({
                        buttons: draft.rive.buttons.filter((_, i) => i !== index),
                      })
                    }
                    icon={<X className="h-3.5 w-3.5" />}
                  />
                </div>

                <ActionPicker
                  config={{
                    action: button.action === 'cta' ? draft.cta.action : button.action,
                    path: button.path,
                    packId: button.packId,
                    productId: button.productId,
                    reward: draft.cta.reward,
                  }}
                  env={actionEnv}
                  label="Firing it does"
                  allowInherit
                  inheritValue={button.action}
                  onInheritChange={(action) =>
                    onPatchButton(index, { action: action as SignalAction })
                  }
                  onChange={(partial) => onPatchButton(index, partial)}
                />

                <Toggle
                  checked={button.closes}
                  label="Closes the popup"
                  onChange={(closes) => onPatchButton(index, { closes })}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onPatchRive({
                  buttons: [
                    ...draft.rive.buttons,
                    {
                      signal: '',
                      source: 'trigger',
                      action: 'cta',
                      path: '',
                      packId: '',
                      productId: '',
                      closes: true,
                    },
                  ],
                })
              }
              className="text-xs font-black text-primary"
            >
              + Add one by name
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function RulesTab({
  draft,
  panels,
  onPatch,
}: {
  draft: CampaignRow;
  panels: PanelApi;
  onPatch: (partial: Partial<CampaignRow>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Panel
        title="When it fires"
        subtitle={
          draft.triggers.map((rule) => TRIGGER_LABELS[rule.event]).join(', ') || 'No triggers'
        }
        open={panels.isOpen('triggers')}
        onToggle={() => panels.toggle('triggers')}
      >
        <p className="text-[11px] font-medium leading-snug text-muted-foreground">
          Any one of these firing is enough. Hover a trigger to see exactly what makes it fire in
          the app.
        </p>
        <div className="space-y-2">
          {draft.triggers.map((rule, index) => {
            const option = TRIGGER_OPTIONS[rule.event];
            const patchRule = (partial: Partial<CampaignTriggerRule>) => {
              const triggers = [...draft.triggers];
              triggers[index] = { ...rule, ...partial };
              onPatch({ triggers });
            };
            return (
              <div key={`${rule.event}-${index}`} className="space-y-1 rounded-xl bg-muted/40 p-2">
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={rule.event}
                    options={CAMPAIGN_TRIGGERS.map((trigger) => ({
                      value: trigger,
                      label: TRIGGER_LABELS[trigger],
                    }))}
                    onChange={(event) =>
                      patchRule({
                        event: event as CampaignTrigger,
                        minGap: undefined,
                        minDays: undefined,
                        minMinutes: undefined,
                        minStreak: undefined,
                      })
                    }
                  />
                  {option ? (
                    <div className="w-28 shrink-0">
                      <NumberInput
                        value={rule[option.key] as number | undefined}
                        placeholder={option.label}
                        onChange={(value) => patchRule({ [option.key]: value })}
                      />
                    </div>
                  ) : null}
                  <IconButton
                    label="Remove trigger"
                    small
                    danger
                    onClick={() =>
                      onPatch({ triggers: draft.triggers.filter((_, i) => i !== index) })
                    }
                    icon={<X className="h-3.5 w-3.5" />}
                  />
                </div>
                <p className="text-[11px] font-medium leading-snug text-muted-foreground">
                  {TRIGGER_HELP[rule.event]}
                  {option ? ` ${option.hint}` : ''}
                </p>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onPatch({ triggers: [...draft.triggers, { event: 'session_start' }] })
            }
            className="text-xs font-black text-primary"
          >
            + Add a trigger
          </button>
        </div>
      </Panel>

      <Panel
        title="Who wins the moment"
        subtitle={TIER_LABELS[draft.tier]}
        open={panels.isOpen('tier')}
        onToggle={() => panels.toggle('tier')}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Tier" help={TIER_SYSTEM_HELP}>
            <Select
              value={draft.tier}
              options={CAMPAIGN_TIERS.map((tier) => ({ value: tier, label: TIER_LABELS[tier] }))}
              onChange={(tier) => onPatch({ tier })}
            />
          </Field>
          <Slider
            label="Priority"
            value={draft.priority}
            min={0}
            max={100}
            help="Only breaks ties inside the same tier. It can never beat a higher tier."
            onChange={(priority) => onPatch({ priority })}
          />
        </div>
        <p className="rounded-xl bg-muted/40 px-3 py-2 text-[11px] font-medium leading-snug text-muted-foreground">
          {TIER_HELP[draft.tier]}
        </p>
      </Panel>

      <Panel
        title="How often one person sees it"
        subtitle={`${draft.caps.perUser || '∞'} lifetime · ${draft.caps.perDay || '∞'}/day · ${draft.caps.cooldownHours}h apart`}
        open={panels.isOpen('caps')}
        onToggle={() => panels.toggle('caps')}
      >
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Lifetime max" help="0 means no lifetime limit.">
            <NumberInput
              value={draft.caps.perUser}
              min={0}
              onChange={(perUser) => onPatch({ caps: { ...draft.caps, perUser: perUser ?? 0 } })}
            />
          </Field>
          <Field label="Max per day" help="0 means no daily limit.">
            <NumberInput
              value={draft.caps.perDay}
              min={0}
              onChange={(perDay) => onPatch({ caps: { ...draft.caps, perDay: perDay ?? 0 } })}
            />
          </Field>
          <Field label="Cooldown" help="Hours before the same person may see it again.">
            <NumberInput
              value={draft.caps.cooldownHours}
              min={0}
              suffix="h"
              onChange={(cooldownHours) =>
                onPatch({ caps: { ...draft.caps, cooldownHours: cooldownHours ?? 0 } })
              }
            />
          </Field>
          <Field
            label="Give up after"
            help="Stop showing to someone who has dismissed it this many times. 0 never gives up."
          >
            <NumberInput
              value={draft.caps.suppressAfterDismissals}
              min={0}
              suffix="✕"
              onChange={(value) =>
                onPatch({ caps: { ...draft.caps, suppressAfterDismissals: value ?? 0 } })
              }
            />
          </Field>
        </div>
        <Field
          label="Wait after the trigger"
          hint="A popup that lands in the same frame as the thing that triggered it reads as a glitch."
        >
          <NumberInput
            value={draft.caps.delayMs}
            min={0}
            max={20000}
            step={50}
            suffix="ms"
            onChange={(delayMs) => onPatch({ caps: { ...draft.caps, delayMs: delayMs ?? 0 } })}
          />
        </Field>
      </Panel>

      <Panel
        title="Schedule"
        subtitle={
          draft.startAt || draft.endAt
            ? `${draft.startAt ? new Date(draft.startAt).toLocaleDateString() : 'now'} → ${draft.endAt ? new Date(draft.endAt).toLocaleDateString() : 'no end'}`
            : 'Always on'
        }
        open={panels.isOpen('schedule')}
        onToggle={() => panels.toggle('schedule')}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Starts" hint="Leave blank to start as soon as it goes live.">
            <input
              type="datetime-local"
              value={toLocalInput(draft.startAt)}
              onChange={(event) =>
                onPatch({
                  startAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
              className="h-10 w-full rounded-xl bg-muted px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>
          <Field label="Ends" hint="Also what a countdown timer set to the schedule counts to.">
            <input
              type="datetime-local"
              value={toLocalInput(draft.endAt)}
              onChange={(event) =>
                onPatch({
                  endAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                })
              }
              className="h-10 w-full rounded-xl bg-muted px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>
        </div>
        {draft.startAt || draft.endAt ? (
          <button
            type="button"
            onClick={() => onPatch({ startAt: null, endAt: null })}
            className="text-[11px] font-black text-muted-foreground hover:text-foreground"
          >
            Clear the schedule
          </button>
        ) : null}
      </Panel>
    </div>
  );
}

function AudienceTab({
  draft,
  onPatch,
}: {
  draft: CampaignRow;
  onPatch: (partial: Partial<CampaignRow>) => void;
}) {
  const targeting = draft.targeting;
  const set = (partial: Partial<CampaignRow['targeting']>) =>
    onPatch({ targeting: { ...targeting, ...partial } });

  const narrowed = [
    targeting.payer !== 'any' && `payers: ${targeting.payer}`,
    targeting.plus !== 'any' && `plus: ${targeting.plus}`,
    targeting.platform !== 'any' && `platform: ${targeting.platform}`,
    targeting.minDaysSinceSignup != null && `${targeting.minDaysSinceSignup}+ days old`,
    targeting.maxDaysSinceSignup != null && `under ${targeting.maxDaysSinceSignup} days old`,
    targeting.balanceBelow != null && `under ${targeting.balanceBelow} flies`,
    targeting.balanceAbove != null && `over ${targeting.balanceAbove} flies`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Field label="Payers" help="Whether they have ever bought anything.">
          <Select
            value={targeting.payer}
            options={PAYER_TARGETS.map((value) => ({
              value,
              label:
                value === 'any'
                  ? 'Anyone'
                  : value === 'never_paid'
                    ? 'Never paid'
                    : 'Has paid before',
            }))}
            onChange={(payer) => set({ payer })}
          />
        </Field>
        <Field label="Plus">
          <Select
            value={targeting.plus}
            options={PLUS_TARGETS.map((value) => ({
              value,
              label:
                value === 'any' ? 'Anyone' : value === 'plus' ? 'Plus members' : 'Not Plus',
            }))}
            onChange={(plus) => set({ plus })}
          />
        </Field>
        <Field label="Platform" help="Store rules and prices differ, so offers often should too.">
          <Select
            value={targeting.platform}
            options={PLATFORM_TARGETS.map((value) => ({
              value,
              label: value === 'any' ? 'Anywhere' : value === 'web' ? 'Web only' : 'App only',
            }))}
            onChange={(platform) => set({ platform })}
          />
        </Field>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Account at least">
          <NumberInput
            value={targeting.minDaysSinceSignup}
            min={0}
            suffix="d"
            onChange={(minDaysSinceSignup) => set({ minDaysSinceSignup })}
          />
        </Field>
        <Field label="Account at most">
          <NumberInput
            value={targeting.maxDaysSinceSignup}
            min={0}
            suffix="d"
            onChange={(maxDaysSinceSignup) => set({ maxDaysSinceSignup })}
          />
        </Field>
        <Field label="Flies below">
          <NumberInput
            value={targeting.balanceBelow}
            min={0}
            onChange={(balanceBelow) => set({ balanceBelow })}
          />
        </Field>
        <Field label="Flies above">
          <NumberInput
            value={targeting.balanceAbove}
            min={0}
            onChange={(balanceAbove) => set({ balanceAbove })}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-muted/40 p-3">
        <Slider
          label="Rollout"
          value={targeting.rollout}
          min={0}
          max={100}
          step={5}
          suffix="%"
          onChange={(rollout) => set({ rollout })}
        />
        <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
          The other {100 - targeting.rollout}% is a stable holdout — the same people every time,
          so their numbers are a real baseline rather than a different crowd each day.
        </p>
      </div>

      <div className="rounded-xl bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          This reaches
        </p>
        <p className="mt-1 text-xs font-bold leading-relaxed">
          {narrowed.length ? (
            <>
              People matching <span className="text-primary">{narrowed.join(', ')}</span>
              {targeting.rollout < 100 ? `, then ${targeting.rollout}% of those` : ''}.
            </>
          ) : (
            <>
              Everyone
              {targeting.rollout < 100 ? `, narrowed to ${targeting.rollout}% of them` : ''}. Use
              the Launch tab to check it against a real account.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function LaunchTab({
  draft,
  notes,
  stat,
  elementStats,
  explain,
  explainEmail,
  explaining,
  onExplainEmail,
  onRunExplain,
  onResetState,
  onPatch,
  onJumpToNote,
}: {
  draft: CampaignRow;
  notes: ReviewNote[];
  stat: CampaignStats | undefined;
  elementStats: ElementStat[];
  explain: { audience: Record<string, unknown>; results: ExplainRow[] } | null;
  explainEmail: string;
  explaining: boolean;
  onExplainEmail: (value: string) => void;
  onRunExplain: () => void;
  onResetState: () => void;
  onPatch: (partial: Partial<CampaignRow>) => void;
  onJumpToNote: (note: ReviewNote) => void;
}) {
  const errors = notes.filter((note) => note.level === 'error');
  const warnings = notes.filter((note) => note.level === 'warning');
  const tips = notes.filter((note) => note.level === 'tip');
  const impressions = stat?.impressions ?? 0;
  const pct = (value: number) =>
    impressions ? `${Math.round((value / impressions) * 100)}%` : '—';

  const clickable = draft.canvas.elements.filter((element) =>
    isClickableElement(element.type),
  );
  const byElement = new Map(
    elementStats
      .filter((row) => row.campaignId === draft.id)
      .map((row) => [row.elementId, row.clicks]),
  );

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-2xl p-3',
          errors.length
            ? 'bg-red-500/10'
            : warnings.length
              ? 'bg-amber-500/10'
              : 'bg-emerald-500/10',
        )}
      >
        <p
          className={cn(
            'flex items-center gap-1.5 text-[13px] font-black',
            errors.length
              ? 'text-red-500'
              : warnings.length
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          {errors.length
            ? `${errors.length} thing${errors.length > 1 ? 's' : ''} to fix before this can go live`
            : warnings.length
              ? 'Ready to go live, with some things worth a look'
              : 'Everything checks out'}
        </p>
        {notes.length ? (
          <ul className="mt-2 space-y-1">
            {[...errors, ...warnings, ...tips].map((note, index) => (
              <li key={`${note.message}-${index}`}>
                <button
                  type="button"
                  onClick={() => onJumpToNote(note)}
                  className="flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-background/50"
                >
                  <span
                    className={cn(
                      'mt-0.5 shrink-0',
                      note.level === 'error'
                        ? 'text-red-500'
                        : note.level === 'warning'
                          ? 'text-amber-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {note.level === 'tip' ? (
                      <Lightbulb className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="text-[11px] font-bold leading-snug">{note.message}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-2xl bg-muted/40 p-3">
        <p className="mb-2 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CAMPAIGN_STATUSES.map((status) => {
            const blocked = status === 'live' && errors.length > 0;
            return (
              <button
                key={status}
                type="button"
                disabled={blocked}
                onClick={() => onPatch({ status })}
                className={cn(
                  'rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  draft.status === status
                    ? 'bg-foreground text-background'
                    : 'bg-background hover:bg-muted',
                )}
              >
                <span className="block text-xs font-black capitalize">{status}</span>
                <span
                  className={cn(
                    'block text-[10px] font-medium leading-snug',
                    draft.status === status ? 'opacity-80' : 'text-muted-foreground',
                  )}
                >
                  {blocked ? 'Fix the errors above first' : STATUS_HELP[status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {draft.id ? (
        <div className="rounded-2xl bg-muted/40 p-3">
          <p className="mb-2 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
            Results
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Shown" value={impressions.toLocaleString()} />
            <Metric label="Reached" value={(stat?.reach ?? 0).toLocaleString()} />
            <Metric label="Tapped" value={pct(stat?.clicks ?? 0)} />
            <Metric label="Converted" value={(stat?.conversions ?? 0).toLocaleString()} />
          </div>

          {clickable.length ? (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                Per button
              </p>
              {clickable.map((element) => {
                const clicks = byElement.get(element.id) ?? 0;
                return (
                  <div
                    key={element.id}
                    className="flex items-center gap-2 text-[11px] font-bold"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {element.label || ELEMENT_LABELS[element.type]}
                      <span className="ml-1.5 font-medium text-muted-foreground">
                        {CTA_LABELS[element.action ?? 'dismiss']}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {clicks} · {pct(clicks)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
          <Wand2 className="h-3.5 w-3.5" />
          Dry run
        </p>
        <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
          Check every campaign against a real account, and see the reason when one wouldn&apos;t
          show. Session rules (one takeover per session, what the user is in the middle of) are
          decided on the device, so a campaign marked eligible here may still wait for a better
          moment.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={explainEmail}
            onChange={(event) => onExplainEmail(event.target.value)}
            placeholder="email (blank = you)"
            className="h-10 min-w-0 flex-1 rounded-xl bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="button"
            onClick={onRunExplain}
            disabled={explaining}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-50"
          >
            {explaining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run'}
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={onResetState}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-background px-3 text-xs font-black"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear its history
            </button>
          ) : null}
        </div>

        {explain ? (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground">
              {Object.entries(explain.audience)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(' · ')}
            </p>
            {explain.results.map((row) => (
              <p
                key={row.id}
                className={cn(
                  'text-[11px] font-bold',
                  row.id === draft.id && 'rounded bg-background px-1.5 py-0.5',
                )}
              >
                <span className={row.eligible ? 'text-emerald-500' : 'text-muted-foreground'}>
                  {row.eligible ? '✓' : '✕'} {row.name}
                </span>
                <span className="font-medium text-muted-foreground"> — {row.reason}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-2.5">
      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-black tabular-nums">{value}</p>
    </div>
  );
}

/**
 * The popup drawn with the same components the app uses, so what an admin
 * signs off on is what ships. Actions are described instead of run — pressing
 * "Buy a fly pack" here must not open a payment sheet.
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
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const payload = useMemo(() => toPayload(row), [row]);
  const blocking = isBlockingTemplate(row.template);

  const frame = surface === 'web' ? { w: 720, h: 560 } : { w: 320, h: 640 };

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const measure = () => setScale(Math.min(1, holder.clientWidth / frame.w));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(holder);
    return () => observer.disconnect();
  }, [frame.w]);

  const describe = (label: string) => {
    setOutcome(label);
    window.setTimeout(() => setOutcome(null), 1800);
  };

  const handleSignal = (signal: RiveSignal) => {
    onSignal(signal);
    const resolved = resolveRiveSignal(row, signal);
    describe(
      resolved
        ? `"${signal.name}" → ${CTA_LABELS[resolved.action]}`
        : `"${signal.name || 'unnamed'}" — not mapped to anything`,
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
        describe(
          `${element.label || ELEMENT_LABELS[element.type]} → ${CTA_LABELS[element.action ?? 'dismiss']}`,
        )
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

  return (
    <div ref={holderRef} className={dark ? 'dark' : undefined}>
      <div style={{ height: frame.h * scale }}>
        <div
          className="origin-top-left"
          style={{ width: frame.w, height: frame.h, transform: `scale(${scale})` }}
        >
          {surface === 'web' ? (
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-background ring-1 ring-border">
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
          ) : (
            <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-background ring-[6px] ring-neutral-800">
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
          )}
        </div>
      </div>
    </div>
  );
}
