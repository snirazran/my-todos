'use client';

import React from 'react';
import useSWR from 'swr';
import { Users } from 'lucide-react';
import { FlyAmount } from '@/components/ui/FlyAmount';
import type { ItemDef } from '@/lib/skins/catalog';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import type { FriendSummary } from '@/lib/friends/indices';
import {
  BackgroundArt,
  ItemArt,
  RAIL_ITEM_CLASS,
  ShelfHeader,
  TileArt,
  TileRail,
} from './DressingRoom';

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
    <section aria-label="Seen on your friends">
      <ShelfHeader
        icon={<Users className="h-3.5 w-3.5" strokeWidth={2.75} />}
        label="Seen on your friends"
      />
      <TileRail>
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
          return (
            <div key={`${entry.kind}-${id}`} className={RAIL_ITEM_CLASS}>
              <button
                type="button"
                onClick={() =>
                  entry.kind === 'item'
                    ? onPickItem(entry.item)
                    : onPickBackground(entry.bg)
                }
                aria-label={`${name}, worn by ${wornBy}`}
                className="group flex w-full flex-col items-stretch gap-1 text-left"
              >
                <TileArt
                  rarity={rarity}
                  className="transition-transform duration-150 group-active:scale-95"
                >
                  {entry.kind === 'item' ? (
                    <ItemArt item={entry.item} />
                  ) : (
                    <BackgroundArt bg={entry.bg} />
                  )}
                </TileArt>
                <span className="flex h-5 items-center justify-center text-[12.5px] font-black tabular-nums leading-none">
                  <FlyAmount amount={price} size={12.5} className="text-foreground" />
                </span>
                <span className="-mt-1 truncate px-1 text-center text-[11px] font-bold text-muted-foreground">
                  {wornBy}
                </span>
              </button>
            </div>
          );
        })}
      </TileRail>
    </section>
  );
}
