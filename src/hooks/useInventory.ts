import { useMemo } from 'react';
import useSWR from 'swr';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';

type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    unseenItems?: string[];
    flies: number;
  };
  catalog: ItemDef[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useInventory(active: boolean = true) {
  const { data, mutate, error, isLoading } = useSWR<ApiData>(
    active ? '/api/skins/inventory' : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const markAllSeen = async () => {
    // If no data or no unseen items, skip
    if (!data?.wardrobe?.unseenItems?.length) return;

    // Optimistic update
    mutate(
      {
        ...data,
        wardrobe: {
          ...data.wardrobe!,
          unseenItems: [],
        },
      },
      false
    );

    await fetch('/api/skins/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markSeen' }),
    });

    mutate(); // Re-validate to be sure
  };

  const markItemSeen = async (itemId: string) => {
    if (!data?.wardrobe?.unseenItems?.includes(itemId)) return;

    // Optimistic update: remove just this item
    mutate(
      {
        ...data,
        wardrobe: {
          ...data.wardrobe!,
          unseenItems: data.wardrobe!.unseenItems!.filter((id) => id !== itemId),
        },
      },
      false
    );

    await fetch('/api/skins/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markOneSeen', itemId }),
    });

    mutate();
  };

  const containerIds = useMemo(
    () => new Set((data?.catalog ?? []).filter((i) => i.slot === 'container').map((i) => i.id)),
    [data?.catalog],
  );

  const unseenItems = useMemo(
    () => (data?.wardrobe?.unseenItems ?? []).filter((id) => !containerIds.has(id)),
    [data?.wardrobe?.unseenItems, containerIds],
  );

  return {
    data,
    mutate,
    isLoading,
    error,
    unseenItems,
    unseenCount: unseenItems.length,
    markAllSeen,
    markItemSeen,
  };
}
