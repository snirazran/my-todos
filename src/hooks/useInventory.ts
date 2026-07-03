import { useMemo } from 'react';
import useSWR, { mutate as mutateGlobal } from 'swr';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

export const INVENTORY_KEY = '/api/skins/inventory';
export const INVENTORY_SUMMARY_KEY = '/api/skins/inventory?view=summary';

export function mutateInventoryCaches() {
  mutateGlobal(INVENTORY_KEY);
  mutateGlobal(INVENTORY_SUMMARY_KEY);
}

export function mutateInventorySummary() {
  mutateGlobal(INVENTORY_SUMMARY_KEY);
}

let equipMutationsInFlight = 0;
let lastEquipSettledAt = 0;

export function beginEquipMutation() {
  equipMutationsInFlight += 1;
}

export function endEquipMutation() {
  equipMutationsInFlight = Math.max(0, equipMutationsInFlight - 1);
  lastEquipSettledAt = Date.now();
  return equipMutationsInFlight;
}

export function shouldSuppressEquipEcho() {
  return equipMutationsInFlight > 0 || Date.now() - lastEquipSettledAt < 3000;
}

export function patchInventoryFlies(balance: number) {
  const patch = (curr: any) => {
    if (!curr?.wardrobe) return curr;
    if (curr.wardrobe.flies === balance) return curr;
    return { ...curr, wardrobe: { ...curr.wardrobe, flies: balance } };
  };
  mutateGlobal(INVENTORY_KEY, patch, { revalidate: false });
  mutateGlobal(INVENTORY_SUMMARY_KEY, patch, { revalidate: false });
}

type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    unseenItems?: string[];
    inventoryHistory?: Record<string, string>;
    flies: number;
  };
  catalog: ItemDef[];
  unseenCount?: number;
  unseenContainerCount?: number;
};

const fetcher = bootstrapFetcher;

export function useInventory(active: boolean = true, summary: boolean = false) {
  const { data, mutate, error, isLoading } = useSWR<ApiData>(
    active ? (summary ? INVENTORY_SUMMARY_KEY : INVENTORY_KEY) : null,
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
      (curr) =>
        curr?.wardrobe
          ? { ...curr, wardrobe: { ...curr.wardrobe, unseenItems: [] } }
          : curr,
      { revalidate: false },
    );

    await fetch('/api/skins/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markSeen' }),
    });

    mutateInventorySummary();
  };

  const markContainersSeen = async () => {
    if (!data?.wardrobe?.unseenItems?.length) return;

    // Optimistic: filter out all containers
    const containerIdsArr = (data?.catalog ?? [])
      .filter((i) => i.slot === 'container')
      .map((i) => i.id);
    const containerSet = new Set(containerIdsArr);

    mutate(
      (curr) =>
        curr?.wardrobe
          ? {
              ...curr,
              wardrobe: {
                ...curr.wardrobe,
                unseenItems: (curr.wardrobe.unseenItems ?? []).filter(
                  (id) => !containerSet.has(id),
                ),
              },
            }
          : curr,
      { revalidate: false },
    );

    await fetch('/api/skins/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markContainersSeen' }),
    });

    mutateInventorySummary();
  };

  const markItemSeen = async (itemId: string) => {
    if (!data?.wardrobe?.unseenItems?.includes(itemId)) return;

    // Optimistic update: remove just this item
    mutate(
      (curr) =>
        curr?.wardrobe
          ? {
              ...curr,
              wardrobe: {
                ...curr.wardrobe,
                unseenItems: (curr.wardrobe.unseenItems ?? []).filter(
                  (id) => id !== itemId,
                ),
              },
            }
          : curr,
      { revalidate: false },
    );

    await fetch('/api/skins/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markOneSeen', itemId }),
    });

    mutateInventorySummary();
  };

  const containerIds = useMemo(
    () => new Set((data?.catalog ?? []).filter((i) => i.slot === 'container').map((i) => i.id)),
    [data?.catalog],
  );

  const unseenItems = useMemo(
    () => (data?.wardrobe?.unseenItems ?? []).filter((id) => !containerIds.has(id)),
    [data?.wardrobe?.unseenItems, containerIds],
  );

  const unseenContainers = useMemo(
    () => (data?.wardrobe?.unseenItems ?? []).filter((id) => containerIds.has(id)),
    [data?.wardrobe?.unseenItems, containerIds],
  );

  return {
    data,
    mutate,
    isLoading,
    error,
    unseenItems,
    unseenCount: data?.unseenCount ?? unseenItems.length,
    unseenContainers,
    unseenContainerCount: data?.unseenContainerCount ?? unseenContainers.length,
    markAllSeen,
    markContainersSeen,
    markItemSeen,
  };
}
