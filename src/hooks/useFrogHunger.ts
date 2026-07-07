'use client';

import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { MAX_HUNGER_MS, HUNGRY_MOOD_THRESHOLD } from '@/lib/hungerLogic';
import { INVENTORY_SUMMARY_KEY } from '@/hooks/useInventory';

type SummaryData = {
  wardrobe?: {
    hunger?: number;
    lastHungerUpdate?: string | Date;
  };
};

export function useIsFrogHungry(enabled: boolean) {
  const { data } = useSWR<SummaryData>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  const wardrobe = data?.wardrobe;
  if (
    !wardrobe ||
    typeof wardrobe.hunger !== 'number' ||
    isNaN(wardrobe.hunger) ||
    !wardrobe.lastHungerUpdate
  ) {
    return false;
  }

  const lastUpdate = new Date(wardrobe.lastHungerUpdate).getTime();
  if (isNaN(lastUpdate)) return false;

  const remaining = wardrobe.hunger - (Date.now() - lastUpdate);
  return remaining / MAX_HUNGER_MS <= HUNGRY_MOOD_THRESHOLD;
}
