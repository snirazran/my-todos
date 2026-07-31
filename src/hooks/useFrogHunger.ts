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

function fullnessFrom(wardrobe: SummaryData['wardrobe']): number | null {
  if (
    !wardrobe ||
    typeof wardrobe.hunger !== 'number' ||
    isNaN(wardrobe.hunger) ||
    !wardrobe.lastHungerUpdate
  ) {
    return null;
  }

  const lastUpdate = new Date(wardrobe.lastHungerUpdate).getTime();
  if (isNaN(lastUpdate)) return null;

  const remaining = wardrobe.hunger - (Date.now() - lastUpdate);
  return Math.max(0, Math.min(1, remaining / MAX_HUNGER_MS));
}

export function useIsFrogHungry(enabled: boolean) {
  const { data } = useSWR<SummaryData>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  const fullness = fullnessFrom(data?.wardrobe);
  return fullness === null ? false : fullness <= HUNGRY_MOOD_THRESHOLD;
}

/**
 * How full the belly is right now, 0–1, or null while it is unknown. Shares the
 * summary request with `useIsFrogHungry`, so reading it costs no extra fetch.
 */
export function useFrogFullness(enabled: boolean): number | null {
  const { data } = useSWR<SummaryData>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  return fullnessFrom(data?.wardrobe);
}
