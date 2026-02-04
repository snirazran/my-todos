'use client';

import useSWR from 'swr';
import { byId } from '@/lib/skins/catalog';

export function useWardrobeIndices(enabled: boolean) {
  const { data } = useSWR(
    enabled ? '/api/skins/inventory' : null,
    (u) => fetch(u!).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const eq = data?.wardrobe?.equipped ?? {};

  const getIndex = (itemId?: string | null) => {
    if (!itemId) return 0;
    const item = byId[itemId];
    return item ? item.riveIndex : 0;
  };

  return {
    indices: {
      skin: getIndex(eq.skin),
      hat: getIndex(eq.hat),
      scarf: getIndex(eq.scarf),
      hand_item: getIndex(eq.hand_item),
      glasses: getIndex(eq.glasses),
      mood: 0, // Default 0 for now
    },
    wardrobeData: data,
  };
}
