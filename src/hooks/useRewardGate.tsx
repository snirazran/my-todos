'use client';

import React, { useCallback, useState } from 'react';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';

export type RewardGateMode = 'free' | 'ad' | 'plus';

type Options = {
  isPlus?: boolean;
  adFailedMessage?: string;
};

export function useRewardGate(
  placement: string,
  { isPlus = false, adFailedMessage }: Options = {},
) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [pending, setPending] = useState<{ run: () => Promise<void> } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode: RewardGateMode = isPlus
    ? 'free'
    : rewardedAdsAvailable()
      ? 'ad'
      : 'plus';

  const execute = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setError(null);
      if (mode === 'plus') {
        setPending({ run: action });
        setPlusOpen(true);
        return;
      }
      if (mode === 'free') {
        await execute(action);
        return;
      }
      setBusy(true);
      try {
        const outcome = await showRewardedAd(placement);
        if (outcome !== 'rewarded') {
          if (outcome === 'failed') {
            setError(
              adFailedMessage ??
                'Ad not available right now — try again in a moment.',
            );
          }
          return;
        }
        await action();
      } finally {
        setBusy(false);
      }
    },
    [adFailedMessage, busy, execute, mode, placement],
  );

  const closePlus = useCallback(() => {
    setPlusOpen(false);
    setPending(null);
  }, []);

  const plusModal = (
    <PlusUpgradeModal
      open={plusOpen}
      placement={placement}
      onStartTrial={async () => {
        const action = pending?.run;
        setPending(null);
        if (action) await execute(action);
      }}
      onClose={closePlus}
    />
  );

  return {
    mode,
    run,
    busy,
    error,
    setError,
    plusModal,
    plusOpen,
    openPlus: () => setPlusOpen(true),
  };
}
