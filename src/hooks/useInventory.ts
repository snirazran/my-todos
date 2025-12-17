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
      refreshInterval: 60000, // Poll every minute to keep balance/inventory fresh-ish
      revalidateOnFocus: true,
    }
  );

  const markAllSeen = async () => {
    // If no data or no unseen items, skip
    if (!data?.wardrobe.unseenItems?.length) return;

    // Optimistic update
    mutate(
      {
        ...data,
        wardrobe: {
          ...data.wardrobe,
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

  return {
    data,
    mutate,
    isLoading,
    error,
    unseenItems: data?.wardrobe.unseenItems ?? [],
    unseenCount: (data?.wardrobe.unseenItems ?? []).length,
    markAllSeen,
  };
}
