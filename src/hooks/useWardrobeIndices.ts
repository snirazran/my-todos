'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { byId as staticById } from '@/lib/skins/catalog';
import type { ItemDef } from '@/lib/skins/catalog';

const CACHE_KEY = 'frog-wardrobe-indices';

type Indices = { skin: number; mood: number; hat: number; body: number; hand_item: number };

function getCachedIndices(): Indices | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as Indices;
  } catch {}
  return null;
}

export function useWardrobeIndices(enabled: boolean) {
  const { data } = useSWR(
    enabled ? '/api/skins/inventory?view=summary' : null,
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

  const loaded = !!data;

  const indices: Indices = loaded
    ? {
        skin: getIndex(eq.skin),
        mood: 0,
        hat: getIndex(eq.hat),
        body: getIndex(eq.body),
        hand_item: getIndex(eq.hand_item),
      }
    : getCachedIndices() ?? { skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0 };

  // Persist to localStorage when fresh data arrives
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(indices));
      } catch {}
    }
  }, [loaded, indices.skin, indices.hat, indices.body, indices.hand_item]);

  return {
    indices,
    wardrobeData: data,
  };
}
