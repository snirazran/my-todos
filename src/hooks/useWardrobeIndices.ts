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

  return {
    indices: {
      skin: eq?.skin ? byId[eq.skin].riveIndex : 0,
      hat: eq?.hat ? byId[eq.hat].riveIndex : 0,
      scarf: eq?.scarf ? byId[eq.scarf].riveIndex : 0,
      hand_item: eq?.hand_item ? byId[eq.hand_item].riveIndex : 0,
    },
    wardrobeData: data,
  };
}
