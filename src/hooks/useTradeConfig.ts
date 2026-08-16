'use client';

import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import {
  DEFAULT_TRADE_MODIFIERS,
  type TradeModifiers,
} from '@/lib/skins/tradeModifiers';

export const TRADE_CONFIG_KEY = '/api/skins/trade';

/**
 * Recipe ratios, fuel and modifiers are admin-tunable, so the trade screen
 * quotes them from the server rather than hard-coding a ladder that can drift
 * from what the trade will actually charge.
 */
export function useTradeConfig(enabled: boolean = true) {
  const { data } = useSWR<{ modifiers?: TradeModifiers }>(
    enabled ? TRADE_CONFIG_KEY : null,
    bootstrapFetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  return data?.modifiers ?? DEFAULT_TRADE_MODIFIERS;
}
