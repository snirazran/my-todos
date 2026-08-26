'use client';

import { useEffect } from 'react';
import { preloadRewardedAd, rewardedAdsAvailable } from '@/lib/ads';

/** Warms this placement's rewarded ad while a surface that offers one is on
 *  screen, so the tap that spends it opens instantly instead of waiting on a
 *  fresh load. */
export function useRewardedAdPreload(placement: string, enabled = true) {
  useEffect(() => {
    if (!enabled || !rewardedAdsAvailable()) return;
    void preloadRewardedAd(placement);
  }, [enabled, placement]);
}
