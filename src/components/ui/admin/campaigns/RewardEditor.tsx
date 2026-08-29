'use client';

import React, { useMemo, useState } from 'react';
import { Gift, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_REWARD,
  REWARD_KINDS,
  REWARD_KIND_LABELS,
  REWARD_LIMITS,
  REWARD_LIMIT_LABELS,
  type CampaignReward,
  type CampaignRewardGrant,
  type RewardKind,
} from '@/lib/campaigns/types';
import { Field, NumberInput, Select, TextInput, inputClass } from './primitives';

export type RewardCatalogEntry = {
  id: string;
  name: string;
  kind: 'item' | 'background';
  rarity: string;
  slot?: string;
  priceFlies?: number;
};

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-emerald-500',
  rare: 'text-sky-500',
  epic: 'text-violet-500',
  legendary: 'text-amber-500',
};

const needsCatalogId = (kind: RewardKind) => kind === 'item' || kind === 'background';

const unitFor = (kind: RewardKind) =>
  kind === 'flies' ? 'flies' : kind === 'plus_days' ? 'days' : '×';

/**
 * What a button hands out.
 *
 * Every id is picked from the live catalog rather than typed, because a
 * mistyped item id fails silently — the grant lands in an inventory slot no
 * screen renders, and nobody finds out until a user asks where their hat went.
 */
export function RewardEditor({
  reward,
  catalog,
  onChange,
}: {
  reward: CampaignReward | undefined;
  catalog: RewardCatalogEntry[];
  onChange: (reward: CampaignReward) => void;
}) {
  const value = reward ?? DEFAULT_REWARD;
  const [picking, setPicking] = useState<RewardKind | null>(null);

  const patch = (partial: Partial<CampaignReward>) => onChange({ ...value, ...partial });

  const addGrant = (grant: CampaignRewardGrant) => {
    patch({ grants: [...value.grants, grant] });
    setPicking(null);
  };

  const patchGrant = (index: number, partial: Partial<CampaignRewardGrant>) =>
    patch({
      grants: value.grants.map((grant, i) => (i === index ? { ...grant, ...partial } : grant)),
    });

  const removeGrant = (index: number) =>
    patch({ grants: value.grants.filter((_, i) => i !== index) });

  const byId = useMemo(
    () => new Map(catalog.map((entry) => [`${entry.kind}:${entry.id}`, entry])),
    [catalog],
  );

  return (
    <div className="space-y-2.5 rounded-xl bg-background p-3 ring-1 ring-border">
      <p className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
        <Gift className="h-3.5 w-3.5" />
        This button gives
      </p>

      {value.grants.length ? (
        <div className="space-y-1.5">
          {value.grants.map((grant, index) => {
            const entry = grant.id ? byId.get(`${grant.kind}:${grant.id}`) : undefined;
            const orphaned = needsCatalogId(grant.kind) && !!grant.id && !entry;
            return (
              <div
                key={`${grant.kind}-${grant.id}-${index}`}
                className={cn(
                  'flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5',
                  orphaned && 'ring-1 ring-red-500',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">
                    {needsCatalogId(grant.kind)
                      ? (entry?.name ?? grant.id ?? '—')
                      : REWARD_KIND_LABELS[grant.kind]}
                  </span>
                  <span
                    className={cn(
                      'block truncate text-[10px] font-bold',
                      entry ? RARITY_COLORS[entry.rarity] : 'text-muted-foreground',
                    )}
                  >
                    {orphaned
                      ? `"${grant.id}" is not in the catalog any more`
                      : entry
                        ? `${entry.rarity}${entry.slot ? ` · ${entry.slot}` : ''}`
                        : REWARD_KIND_LABELS[grant.kind]}
                  </span>
                </span>
                <div className="w-24 shrink-0">
                  <NumberInput
                    value={grant.amount}
                    min={1}
                    suffix={unitFor(grant.kind)}
                    onChange={(amount) => patchGrant(index, { amount: amount ?? 1 })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeGrant(index)}
                  aria-label="Remove"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
          Nothing yet — this button would give the user nothing.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {REWARD_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() =>
              needsCatalogId(kind)
                ? setPicking(picking === kind ? null : kind)
                : addGrant({ kind, amount: kind === 'flies' ? 100 : 7 })
            }
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black transition-colors',
              picking === kind
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Plus className="h-3 w-3" />
            {REWARD_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {picking ? (
        <CatalogPicker
          kind={picking}
          catalog={catalog}
          onPick={(entry) => addGrant({ kind: picking, id: entry.id, amount: 1 })}
          onCancel={() => setPicking(null)}
        />
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Field
          label="Can be claimed"
          help="The server enforces this. A second tap, a replayed request or a reinstall cannot get a second copy."
        >
          <Select
            value={value.limit}
            options={REWARD_LIMITS.map((limit) => ({
              value: limit,
              label: REWARD_LIMIT_LABELS[limit],
            }))}
            onChange={(limit) => patch({ limit })}
          />
        </Field>
        <Field label="After claiming, say" help="Left blank, the popup just closes.">
          <TextInput
            value={value.successText ?? ''}
            placeholder="Enjoy your hat!"
            onChange={(successText) => patch({ successText })}
          />
        </Field>
      </div>
    </div>
  );
}

function CatalogPicker({
  kind,
  catalog,
  onPick,
  onCancel,
}: {
  kind: RewardKind;
  catalog: RewardCatalogEntry[];
  onPick: (entry: RewardCatalogEntry) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const wanted = kind === 'background' ? 'background' : 'item';

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .filter((entry) => entry.kind === wanted)
      .filter(
        (entry) =>
          !needle ||
          entry.name.toLowerCase().includes(needle) ||
          entry.id.toLowerCase().includes(needle) ||
          entry.rarity.toLowerCase().includes(needle) ||
          (entry.slot ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [catalog, query, wanted]);

  return (
    <div className="space-y-2 rounded-xl bg-muted/60 p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${wanted === 'background' ? 'backgrounds' : 'items'}…`}
          className={cn(inputClass, 'h-9 bg-background pl-8')}
        />
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {results.length ? (
          results.map((entry) => (
            <button
              key={`${entry.kind}:${entry.id}`}
              type="button"
              onClick={() => onPick(entry)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-background"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-black">{entry.name}</span>
              <span
                className={cn(
                  'shrink-0 text-[10px] font-black uppercase',
                  RARITY_COLORS[entry.rarity] ?? 'text-muted-foreground',
                )}
              >
                {entry.rarity}
              </span>
              {entry.slot ? (
                <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {entry.slot}
                </span>
              ) : null}
            </button>
          ))
        ) : (
          <p className="px-2 py-3 text-center text-[11px] font-bold text-muted-foreground">
            {catalog.length ? 'Nothing matches.' : 'Catalog is still loading.'}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-lg py-1 text-[11px] font-black text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
