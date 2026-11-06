'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RewardTile, type QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { RewardPickerDialog, rewardSummary } from '@/components/ui/RewardPickerDialog';
import type { QuestReward } from '@/lib/quests/types';

let catalogPromise: Promise<QuestRewardCatalogItem[]> | null = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      fetch('/api/admin/quests/meta', { credentials: 'include' }).then((res) => (res.ok ? res.json() : null)),
      fetch('/api/admin/gifts', { credentials: 'include' }).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([meta, giftData]) => {
        const items = (meta?.rewardsCatalog ?? []) as QuestRewardCatalogItem[];
        const known = new Set(items.map((item) => item.id));
        const gifts = ((giftData?.gifts ?? []) as { gift: QuestRewardCatalogItem }[])
          .map((entry) => entry.gift)
          .filter((gift) => gift && !known.has(gift.id))
          .map((gift) => ({ id: gift.id, name: gift.name, slot: 'container' as const, rarity: gift.rarity, riveIndex: gift.riveIndex }));
        return [...items, ...gifts];
      })
      .catch(() => {
        catalogPromise = null;
        return [];
      });
  }
  return catalogPromise;
}

export function useRewardCatalog() {
  const [items, setItems] = useState<QuestRewardCatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadCatalog().then((next) => {
      if (!alive) return;
      setItems(next);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const byId = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, QuestRewardCatalogItem>,
    [items],
  );
  const gifts = useMemo(
    () => items.filter((item) => item.slot === 'container').sort((a, b) => a.riveIndex - b.riveIndex),
    [items],
  );
  return { items, byId, gifts, loaded };
}

export function GiftPicker({
  value,
  onChange,
  allowNone = false,
  noneLabel = 'No gift',
}: {
  value: string;
  onChange: (next: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const { byId, gifts, loaded } = useRewardCatalog();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = value ? byId[value] : null;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-[52px] w-full items-center gap-3 rounded-xl border border-border bg-background px-2 text-left transition hover:border-primary/40',
          open && 'border-primary/50 ring-2 ring-primary/15',
        )}
      >
        {value ? (
          <RewardTile
            reward={{ type: 'BOX', itemId: value, amount: 1 }}
            rewardCatalog={byId}
            isPremium={false}
            hideBadge
            still
            className="h-10 w-10 rounded-lg"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-border text-[11px] font-black text-muted-foreground">
            —
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-black text-foreground">
            {value ? current?.name ?? value : noneLabel}
          </span>
          {value && current ? (
            <span className="block text-[11px] font-bold capitalize text-muted-foreground">{current.rarity}</span>
          ) : null}
          {value && !current && loaded ? (
            <span className="block text-[11px] font-bold text-red-500">Not in the catalog</span>
          ) : null}
        </span>
        <ChevronDown className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 min-w-[220px] rounded-2xl border border-border bg-card p-1.5 shadow-[0_4px_0_0_hsl(var(--border)),0_18px_40px_-12px_rgba(0,0,0,0.25)]">
          {allowNone ? (
            <GiftOption selected={!value} onClick={() => { onChange(''); setOpen(false); }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-dashed border-border text-[11px] font-black text-muted-foreground">
                —
              </span>
              <span className="text-[13px] font-black">{noneLabel}</span>
            </GiftOption>
          ) : null}
          {gifts.map((gift) => (
            <GiftOption key={gift.id} selected={gift.id === value} onClick={() => { onChange(gift.id); setOpen(false); }}>
              <RewardTile
                reward={{ type: 'BOX', itemId: gift.id, amount: 1 }}
                rewardCatalog={byId}
                isPremium={false}
                hideBadge
                still
                className="h-9 w-9 rounded-lg"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-black">{gift.name}</span>
                <span className="block text-[11px] font-bold capitalize text-muted-foreground">{gift.rarity}</span>
              </span>
            </GiftOption>
          ))}
          {gifts.length === 0 ? (
            <p className="px-3 py-2 text-[12px] font-bold text-muted-foreground">{loaded ? 'No gift boxes in the catalog.' : 'Loading gifts…'}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GiftOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/60',
        selected && 'bg-primary/10',
      )}
    >
      {children}
      {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

export function RewardStrip({
  rewards,
  rewardCatalog,
  extra,
  empty = 'Nothing',
}: {
  rewards: QuestReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  extra?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (!rewards.length && !extra) {
    return <span className="text-[13px] font-bold text-muted-foreground">{empty}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {rewards.map((reward, index) => (
        <RewardTile
          key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? reward.amount}-${index}`}
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={false}
          still
          className="h-11 w-11 rounded-xl"
        />
      ))}
      {extra}
    </span>
  );
}

export function RewardEditButton({
  rewards,
  rewardCatalog,
  rewardItems,
  onChange,
  title,
}: {
  rewards: QuestReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  rewardItems: QuestRewardCatalogItem[];
  onChange: (next: QuestReward[]) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = rewards.map((reward) => rewardSummary(reward, rewardCatalog)).join(' + ');
  return (
    <>
      <button
        type="button"
        title={title ?? label}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12px] font-black text-foreground shadow-[0_2px_0_0_hsl(var(--border))] transition hover:bg-muted/50"
      >
        <Pencil className="h-3.5 w-3.5" />
        {rewards.length ? 'Change' : 'Pick'}
      </button>
      <RewardPickerDialog
        open={open}
        onOpenChange={setOpen}
        rewards={rewards}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        onSave={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </>
  );
}
