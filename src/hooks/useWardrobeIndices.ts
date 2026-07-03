'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { byId as staticById } from '@/lib/skins/catalog';
import type { ItemDef } from '@/lib/skins/catalog';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

const CACHE_KEY = 'frog-wardrobe-indices';

// NOTE: `mood` is deliberately NOT included here. The wardrobe never sets mood,
// and because this object is rebuilt every render, including `mood: 0` made the
// Frog's controlled-indices effect re-assert mood=0 on every render — which
// clobbered transient mood reactions (e.g. the post-eat "questions" mood).
// Leaving mood out lets those reactions be driven imperatively instead.
type Indices = { skin: number; hat: number; body: number; hand_item: number };

function getCachedIndices(): Indices | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as Indices;
  } catch {}
  return null;
}

export function useWardrobeIndices(enabled: boolean) {
  const { data } = useSWR<{
    wardrobe?: { equipped?: Partial<Record<keyof Indices, string | null>> };
    catalog?: ItemDef[];
  }>(
    enabled ? '/api/skins/inventory?view=summary' : null,
    bootstrapFetcher,
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
        hat: getIndex(eq.hat),
        body: getIndex(eq.body),
        hand_item: getIndex(eq.hand_item),
      }
    : getCachedIndices() ?? { skin: 0, hat: 0, body: 0, hand_item: 0 };

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
