'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { INVENTORY_SUMMARY_KEY } from '@/hooks/useInventory';
import { BACKGROUNDS_KEY, type BackgroundsApiData } from '@/hooks/useBackgrounds';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import {
  countReadyTrades,
  tradeCandidates,
  type TradeReadiness,
} from '@/lib/skins/tradeModifiers';
import type { ItemDef } from '@/lib/skins/catalog';

type SummaryShape = {
  catalog?: ItemDef[];
  wardrobe?: { inventory?: Record<string, number> };
  isPremium?: boolean;
};

/**
 * The single answer to "how many trades can I make right now", shared by every
 * badge. Both keys are bootstrap slices, so this costs no extra request — and
 * having one source stops the tab, the nav and the wardrobe popup from quoting
 * three different numbers for the same wardrobe.
 */
export function useTradeReadiness(enabled: boolean = true): TradeReadiness {
  const { data } = useSWR<SummaryShape>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { data: backgrounds } = useSWR<BackgroundsApiData>(
    enabled ? BACKGROUNDS_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const modifiers = useTradeConfig(enabled);

  return useMemo(
    () =>
      countReadyTrades({
        candidates: tradeCandidates({
          catalog: data?.catalog ?? [],
          inventory: data?.wardrobe?.inventory,
          backgrounds: backgrounds?.catalog,
          backgroundInventory: backgrounds?.inventory,
          modifiers,
          skipBackgroundIds: [DEFAULT_BACKGROUND_ID],
        }),
        modifiers,
        isPlus: !!data?.isPremium,
      }),
    [
      data?.catalog,
      data?.wardrobe?.inventory,
      data?.isPremium,
      backgrounds?.catalog,
      backgrounds?.inventory,
      modifiers,
    ],
  );
}

/** Just the number, for the badges that only render a count. */
export function useReadyTrades(enabled: boolean = true) {
  return useTradeReadiness(enabled).trades;
}
