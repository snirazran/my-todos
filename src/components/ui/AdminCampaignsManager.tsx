'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLY_PACKS } from '@/lib/flyPacks';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  CTA_LABELS,
  DEFAULT_CAPS,
  DEFAULT_COPY,
  DEFAULT_TARGETING,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  TIER_LABELS,
  TRIGGER_LABELS,
  isBlockingTemplate,
  type CampaignCaps,
  type CampaignCopy,
  type CampaignCta,
  type CampaignOffer,
  type CampaignStatus,
  type CampaignTargeting,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTrigger,
  type CampaignTriggerRule,
} from '@/lib/campaigns/types';

type CampaignRow = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  status: CampaignStatus;
  priority: number;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string;
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

const STATUS_STYLES: Record<CampaignStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  test: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  paused: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
};

const blank = (): CampaignRow => ({
  id: '',
  name: '',
  template: 'announcement',
  tier: 'nudge',
  status: 'draft',
  priority: 50,
  copy: { ...DEFAULT_COPY },
  cta: { action: 'dismiss', path: '' },
  offer: { packId: '', bonusLabel: '' },
  triggers: [{ event: 'session_start' }],
  targeting: { ...DEFAULT_TARGETING },
  caps: { ...DEFAULT_CAPS },
  startAt: null,
  endAt: null,
  imageUrl: '',
});

const toLocalInput = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : '';

export function AdminCampaignsManager() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CampaignRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainEmail, setExplainEmail] = useState('');
  const [explain, setExplain] = useState<{
    audience: Record<string, unknown>;
    results: ExplainRow[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const statById = useMemo(
    () => new Map(stats.map((s) => [s._id, s])),
    [stats],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/campaigns', { credentials: 'include' });
      const data = await res.json();
      setRows(
        (data.items ?? []).map((item: CampaignRow & { startAt?: string; endAt?: string }) => ({
          ...blank(),
          ...item,
          copy: { ...DEFAULT_COPY, ...(item.copy ?? {}) },
          targeting: { ...DEFAULT_TARGETING, ...(item.targeting ?? {}) },
          caps: { ...DEFAULT_CAPS, ...(item.caps ?? {}) },
        })),
      );
      setStats(data.stats ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setDraft({ ...blank(), ...data.item, imageUrl: draft.imageUrl });
    } finally {
      setSaving(false);
    }
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

  const upload = async (file: File) => {
    if (!draft?.id) {
      setError('Save the campaign first, then add art.');
      return;
    }
    const form = new FormData();
    form.append('id', draft.id);
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
    setDraft((d) => (d ? { ...d, imageUrl: data.url } : d));
    await load();
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

  const patch = (partial: Partial<CampaignRow>) =>
    setDraft((d) => (d ? { ...d, ...partial } : d));

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
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
            onClick={() => setDraft(blank())}
            className="ml-auto flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-2">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            {rows.map((row) => {
              const stat = statById.get(row.id);
              const ctr = stat?.impressions
                ? Math.round((stat.clicks / stat.impressions) * 100)
                : 0;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(row)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 transition-colors',
                    draft?.id === row.id ? 'ring-2 ring-primary' : 'ring-border hover:ring-foreground/20',
                  )}
                >
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
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
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-bold text-muted-foreground">
                      {row.template} · {row.triggers.map((t) => TRIGGER_LABELS[t.event]).join(', ') || 'no triggers'}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-muted-foreground">
                      {stat?.impressions ?? 0} shown · {stat?.clicks ?? 0} clicks ({ctr}%) ·{' '}
                      {stat?.conversions ?? 0} converted
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(row.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        void remove(row.id);
                      }
                    }}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </span>
                </button>
              );
            })}

            <div className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="flex items-center gap-2 text-sm font-black">
                <Wand2 className="h-4 w-4" />
                Dry run
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                Check every campaign against a real account — and see the reason when one
                wouldn&apos;t show.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={explainEmail}
                  onChange={(e) => setExplainEmail(e.target.value)}
                  placeholder="email (blank = you)"
                  className="h-10 flex-1 rounded-xl bg-muted px-3 text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  onClick={runExplain}
                  className="h-10 rounded-xl bg-foreground px-4 text-sm font-black text-background"
                >
                  Run
                </button>
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
          </div>

          {draft ? (
            <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border">
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

              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className="input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Template">
                  <select
                    value={draft.template}
                    onChange={(e) => patch({ template: e.target.value as CampaignTemplate })}
                    className="input"
                  >
                    {CAMPAIGN_TEMPLATES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
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

              <p className="-mt-2 text-[11px] font-bold text-muted-foreground">
                {isBlockingTemplate(draft.template)
                  ? 'Takes over the screen — capped at one per session across all campaigns.'
                  : 'Non-blocking banner — can show even while a sheet is open.'}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tier (decides collisions)">
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
                <Field label={`Priority within tier (${draft.priority})`}>
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

              <Field label="Art">
                <div className="flex items-center gap-3">
                  {draft.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.imageUrl}
                      alt=""
                      className="h-16 w-24 rounded-xl object-cover ring-1 ring-border"
                    />
                  ) : null}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="h-10 rounded-xl bg-muted px-4 text-sm font-black"
                  >
                    Upload image
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Eyebrow">
                  <input
                    value={draft.copy.eyebrow}
                    onChange={(e) => patch({ copy: { ...draft.copy, eyebrow: e.target.value } })}
                    className="input"
                  />
                </Field>
                <Field label="Headline">
                  <input
                    value={draft.copy.headline}
                    onChange={(e) => patch({ copy: { ...draft.copy, headline: e.target.value } })}
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
                    onChange={(e) => patch({ copy: { ...draft.copy, ctaLabel: e.target.value } })}
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
                      patch({ cta: { ...draft.cta, action: e.target.value as CampaignCta['action'] } })
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

              {draft.template === 'pack-offer' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Highlighted pack">
                    <select
                      value={draft.offer.packId ?? ''}
                      onChange={(e) => patch({ offer: { ...draft.offer, packId: e.target.value } })}
                      className="input"
                    >
                      <option value="">None</option>
                      {FLY_PACKS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} · {p.amount.toLocaleString()} flies
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bonus badge">
                    <input
                      value={draft.offer.bonusLabel ?? ''}
                      onChange={(e) =>
                        patch({ offer: { ...draft.offer, bonusLabel: e.target.value } })
                      }
                      placeholder="+100% extra"
                      className="input"
                    />
                  </Field>
                </div>
              ) : null}

              <Field label="Show when">
                <div className="space-y-2">
                  {draft.triggers.map((rule, index) => (
                    <div key={`${rule.event}-${index}`} className="flex items-center gap-2">
                      <select
                        value={rule.event}
                        onChange={(e) => {
                          const triggers = [...draft.triggers];
                          triggers[index] = { ...rule, event: e.target.value as CampaignTrigger };
                          patch({ triggers });
                        }}
                        className="input flex-1"
                      >
                        {CAMPAIGN_TRIGGERS.map((t) => (
                          <option key={t} value={t}>
                            {TRIGGER_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      {rule.event === 'insufficient_flies' ? (
                        <input
                          type="number"
                          value={rule.minGap ?? ''}
                          placeholder="min gap"
                          onChange={(e) => {
                            const triggers = [...draft.triggers];
                            triggers[index] = {
                              ...rule,
                              minGap: e.target.value === '' ? undefined : Number(e.target.value),
                            };
                            patch({ triggers });
                          }}
                          className="input w-28"
                        />
                      ) : null}
                      {rule.event === 'returned_after_absence' ? (
                        <input
                          type="number"
                          value={rule.minDays ?? ''}
                          placeholder="min days"
                          onChange={(e) => {
                            const triggers = [...draft.triggers];
                            triggers[index] = {
                              ...rule,
                              minDays: e.target.value === '' ? undefined : Number(e.target.value),
                            };
                            patch({ triggers });
                          }}
                          className="input w-28"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          patch({ triggers: draft.triggers.filter((_, i) => i !== index) })
                        }
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
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
              </Field>

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
                  onChange={(v) => patch({ targeting: { ...draft.targeting, balanceBelow: v } })}
                />
                <NumberField
                  label="Flies above"
                  value={draft.targeting.balanceAbove}
                  onChange={(v) => patch({ targeting: { ...draft.targeting, balanceAbove: v } })}
                />
              </div>

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

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <input
                    type="datetime-local"
                    value={toLocalInput(draft.startAt)}
                    onChange={(e) =>
                      patch({ startAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                    className="input"
                  />
                </Field>
                <Field label="Ends">
                  <input
                    type="datetime-local"
                    value={toLocalInput(draft.endAt)}
                    onChange={(e) =>
                      patch({ endAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                    className="input"
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save campaign'}
              </button>
            </div>
          ) : (
            <div className="hidden rounded-2xl bg-card p-8 text-center text-sm font-bold text-muted-foreground ring-1 ring-border lg:block">
              Pick a campaign to edit, or create a new one.
            </div>
          )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
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
