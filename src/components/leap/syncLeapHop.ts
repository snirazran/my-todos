'use client';

import { mutate } from 'swr';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import type { LeapHopResult } from '@/lib/leap/types';

export const LEAP_LANDED_EVENT = 'leap-landed';

export function syncLeapHop(result: LeapHopResult | null | undefined) {
  if (!result) return;
  void mutate((key) => typeof key === 'string' && key.startsWith('/api/leap'));
  if (result.grantedItemIds.length) mutateInventoryCaches();
  if (result.landed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LEAP_LANDED_EVENT, { detail: result.weekKey }));
  }
}
