'use client';

import React from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import type { ItemDef } from '@/lib/skins/catalog';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
import type { FriendSummary } from '@/lib/friends/indices';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type FlexEntry =
  | { kind: 'item'; item: ItemDef; friendNames: string[] }
  | { kind: 'bg'; bg: BackgroundItem; friendNames: string[] };

const SLOTS = ['skin', 'hat', 'body', 'hand_item'] as const;

export function SeenOnFriendsRow({
  enabled,
  catalog,
  backgrounds,
  ownedItems,
  ownedBackgrounds,
  onPickItem,
  onPickBackground,
}: {
  enabled: boolean;
  catalog: ItemDef[];
  backgrounds: BackgroundItem[];
  ownedItems: Record<string, number>;
  ownedBackgrounds: Record<string, number>;
  onPickItem: (item: ItemDef) => void;
  onPickBackground: (bg: BackgroundItem) => void;
}) {
  const tz = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const { data } = useSWR<{ friends: FriendSummary[] }>(
    enabled ? `/api/friends?tz=${encodeURIComponent(tz)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const entries = React.useMemo<FlexEntry[]>(() => {
    const friends = data?.friends ?? [];
    if (!friends.length) return [];

    const bySlotIndex = new Map<string, ItemDef>();
    for (const item of catalog) {
      bySlotIndex.set(`${item.slot}:${item.riveIndex}`, item);
    }
    const bgById = new Map(backgrounds.map((b) => [b.id, b]));

    const itemWearers = new Map<string, string[]>();
    const bgWearers = new Map<string, string[]>();
    for (const friend of friends) {
      for (const slot of SLOTS) {
        const idx = friend.indices?.[slot] ?? 0;
        if (idx <= 0) continue;
        const item = bySlotIndex.get(`${slot}:${idx}`);
        if (!item || (ownedItems[item.id] ?? 0) > 0) continue;
        const names = itemWearers.get(item.id) ?? [];
        names.push(friend.name);
        itemWearers.set(item.id, names);
      }
      if (friend.backgroundId && bgById.has(friend.backgroundId)) {
        if ((ownedBackgrounds[friend.backgroundId] ?? 0) <= 0) {
          const names = bgWearers.get(friend.backgroundId) ?? [];
          names.push(friend.name);
          bgWearers.set(friend.backgroundId, names);
        }
      }
    }

    const result: FlexEntry[] = [];
    itemWearers.forEach((friendNames, id) => {
      const item = catalog.find((i) => i.id === id);
      if (item && (item.priceFlies ?? 0) > 0)
        result.push({ kind: 'item', item, friendNames });
    });
    bgWearers.forEach((friendNames, id) => {
      const bg = bgById.get(id);
      if (bg && bg.priceFlies > 0) result.push({ kind: 'bg', bg, friendNames });
    });
    result.sort((a, b) => {
      const pa = a.kind === 'item' ? (a.item.priceFlies ?? 0) : a.bg.priceFlies;
      const pb = b.kind === 'item' ? (b.item.priceFlies ?? 0) : b.bg.priceFlies;
      return pb - pa;
    });
    return result.slice(0, 10);
  }, [data?.friends, catalog, backgrounds, ownedItems, ownedBackgrounds]);

  if (!entries.length) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        Seen on your friends
      </p>
      <DragScrollRow>
        {entries.map((entry) => {
          const id = entry.kind === 'item' ? entry.item.id : entry.bg.id;
          const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
          const rarity =
            entry.kind === 'item' ? entry.item.rarity : entry.bg.rarity;
          const price =
            entry.kind === 'item'
              ? (entry.item.priceFlies ?? 0)
              : entry.bg.priceFlies;
          const wornBy =
            entry.friendNames.length === 1
              ? entry.friendNames[0]
              : `${entry.friendNames[0]} +${entry.friendNames.length - 1}`;
          const config = RARITY_CONFIG[rarity];
          return (
            <button
              key={`${entry.kind}-${id}`}
              type="button"
              onClick={() =>
                entry.kind === 'item'
                  ? onPickItem(entry.item)
                  : onPickBackground(entry.bg)
              }
              className={cn(
                'flex w-[132px] shrink-0 flex-col items-stretch rounded-xl border-2 bg-card p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
                config.border,
              )}
            >
              <div className="flex h-16 items-end justify-center overflow-hidden rounded-lg bg-muted/40">
                {entry.kind === 'item' ? (
                  <FrogSnapshot
                    className="h-[125%] w-[125%] object-contain"
                    indices={{ [entry.item.slot]: entry.item.riveIndex }}
                    width={120}
                    height={120}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={backgroundPreview(entry.bg)}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="mt-1.5 truncate text-xs font-black text-foreground">
                {name}
              </p>
              <p className="truncate text-[10px] font-semibold text-muted-foreground">
                Worn by {wornBy}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-black tabular-nums text-foreground">
                <Fly size={14} paused y={-1} />
                {price.toLocaleString()}
              </span>
            </button>
          );
        })}
      </DragScrollRow>
    </div>
  );
}
