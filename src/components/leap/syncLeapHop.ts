'use client';

import { mutate } from 'swr';
import { patchInventoryFlies, mutateInventoryCaches } from '@/hooks/useInventory';
import type { LeapHopResult } from '@/lib/leap/types';

export function syncLeapHop(result: LeapHopResult | null | undefined) {
  if (!result) return;
  void mutate((key) => typeof key === 'string' && key.startsWith('/api/leap'));
  if (typeof result.balanceAfter === 'number') {
    patchInventoryFlies(result.balanceAfter);
  }
  if (result.grantedItemIds.length || result.shieldsGranted) {
    mutateInventoryCaches();
  }
}
