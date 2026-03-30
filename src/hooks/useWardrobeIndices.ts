'use client';

import useSWR from 'swr';
import { byId as staticById } from '@/lib/skins/catalog';
import type { ItemDef } from '@/lib/skins/catalog';

export function useWardrobeIndices(enabled: boolean) {
  const { data } = useSWR(
    enabled ? '/api/skins/inventory' : null,
    (u) => fetch(u!).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const eq = data?.wardrobe?.equipped ?? {};

  // Build byId from the returned catalog (includes DB items)
  const catalogById: Record<string, ItemDef> = {};
  if (data?.catalog) {
    for (const item of data.catalog) {
      catalogById[item.id] = item;
    }
  }

  const getIndex = (itemId?: string | null) => {
    if (!itemId) return 0;
    const item = catalogById[itemId] ?? staticById[itemId];
    return item ? item.riveIndex : 0;
  };

  return {
    indices: {
      skin: getIndex(eq.skin),
      mood: 0,
      hat: getIndex(eq.hat),
      body: getIndex(eq.body),
      hand_item: getIndex(eq.hand_item),
    },
    wardrobeData: data,
  };
}
