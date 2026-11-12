'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import type { LeapClaimResult, LeapView } from '@/lib/leap/types';
import { useLeapView } from './useLeapView';

export async function requestLeapClaim(): Promise<{
  claim: LeapClaimResult | null;
  view: LeapView | null;
  error: string | null;
}> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch('/api/leap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });
    const payload = await res.json().catch(() => ({}));
    return {
      claim: res.ok ? (payload.claim as LeapClaimResult) : null,
      view: (payload.view as LeapView | undefined) ?? null,
      error: res.ok ? null : payload.error || 'Could not open the gift. Try again.',
    };
  } catch {
    return { claim: null, view: null, error: 'Could not open the gift. Try again.' };
  }
}

export function revealLeapClaim(
  claim: LeapClaimResult,
  view: LeapView | null | undefined,
  source?: Element | null,
) {
  enqueueQuestRewardReveal(
    {
      fliesGranted: claim.fliesGranted,
      flyBalanceAfter: claim.balanceAfter,
      grantedItemIds: claim.grantedItemIds,
      grantedBackgroundIds: claim.grantedBackgroundIds,
    },
    {
      catalog: {
        ...((view?.rewardCatalog ?? {}) as RevealCatalog),
        ...((claim.catalog ?? {}) as RevealCatalog),
      },
      isPremium: false,
      source: source ?? null,
    },
  );
  mutateInventoryCaches();
}

export const LeapSandboxContext = createContext(false);

export function useLeapClaim() {
  const sandbox = useContext(LeapSandboxContext);
  const { data: current, mutate } = useLeapView();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const claim = useCallback(
    async (options?: { source?: Element | null; reveal?: boolean }) => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (sandbox) {
          if (current) {
            const chest = { ...current.week.chest, claimed: true, plusClaimed: current.isPremium };
            void mutate({ ...current, week: { ...current.week, chest } }, { revalidate: false });
          }
          return null;
        }
        const result = await requestLeapClaim();
        if (result.view) void mutate(result.view, { revalidate: false });
        if (!result.claim) {
          setError(result.error);
          return null;
        }
        if (options?.reveal !== false) {
          revealLeapClaim(result.claim, result.view, options?.source);
        }
        return { claim: result.claim, view: result.view };
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [mutate, sandbox, current],
  );

  return { claim, busy, error };
}
