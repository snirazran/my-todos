'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { mutate as swrMutate } from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';
import {
  GiftRevealOverlay,
  fliesPrize,
} from '@/components/ui/gift-box/GiftRevealOverlay';
import { trackGrowthEvent } from '@/lib/growthTrack';
import { markFlyEarn } from '@/lib/flyEarn';
import { byId } from '@/lib/skins/catalog';
import type { CrossGiftStatus } from '@/lib/crossGift';

export const CROSS_GIFT_SWR_KEY = 'cross-gift-status';
export const FUNNEL_GIFT_PENDING_KEY = 'frogress_funnel_gift_pending';

export function currentPlatform(): 'web' | 'native' {
  return Capacitor.isNativePlatform() ? 'native' : 'web';
}

export function mutateFlyCaches() {
  void swrMutate(
    (key) => typeof key === 'string' && key.startsWith('/api/skins'),
  );
  void swrMutate(
    (key) => typeof key === 'string' && key.startsWith('/api/user'),
  );
}

export function CrossGiftProvider() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { showNotification } = useNotification();
  const helloSentRef = useRef(false);
  const funnelClaimRef = useRef(false);
  const [status, setStatus] = useState<CrossGiftStatus | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (loading || !user || helloSentRef.current) return;
    helloSentRef.current = true;
    let cancelled = false;
    const sendHello = async (attempt: number) => {
      try {
        const res = await fetch('/api/cross-gift/hello', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: currentPlatform() }),
        });
        if (!res.ok) throw new Error(`hello failed: ${res.status}`);
        const data = (await res.json()) as CrossGiftStatus;
        if (cancelled) return;
        setStatus(data);
        void swrMutate(CROSS_GIFT_SWR_KEY, data, false);
        if (data.firstSeen) {
          void swrMutate(
            (key) => typeof key === 'string' && key.startsWith('/api/quests'),
          );
        }
      } catch {
        if (cancelled || attempt >= 2) return;
        setTimeout(() => void sendHello(attempt + 1), 3000 * (attempt + 1));
      }
    };
    void sendHello(0);
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // Bank the /try funnel reward for users who signed in through a path that
  // left the funnel page (e.g. email link); the page itself claims inline.
  useEffect(() => {
    if (loading || !user || funnelClaimRef.current) return;
    if (pathname === '/try') return;
    let pending = false;
    try {
      pending = !!localStorage.getItem(FUNNEL_GIFT_PENDING_KEY);
    } catch {}
    if (!pending) return;
    funnelClaimRef.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/funnel-gift/claim', { method: 'POST' });
        if (!res.ok) return;
        try {
          localStorage.removeItem(FUNNEL_GIFT_PENDING_KEY);
        } catch {}
        const data = await res.json();
        if (data?.itemId) {
          mutateFlyCaches();
          trackGrowthEvent('funnel_gift_claimed', { via: 'provider' });
          const name = byId[data.itemId]?.name ?? 'A new skin';
          showNotification(`${name} was saved to your pond 🎁`);
        }
      } catch {
        /* retry next session */
      }
    })();
  }, [user, loading, pathname, showNotification]);

  useEffect(() => {
    if (!status?.claimable || pathname !== '/') return;
    const timer = setTimeout(() => {
      setOverlayOpen(true);
      trackGrowthEvent('xplat_gift_shown', { platform: status.platform });
    }, 1600);
    return () => clearTimeout(timer);
  }, [status, pathname]);

  const finish = (claimed: boolean) => {
    setOverlayOpen(false);
    if (!status) return;
    const next = { ...status, claimable: false, claimed };
    setStatus(next);
    void swrMutate(CROSS_GIFT_SWR_KEY, next, false);
  };

  const handleClaim = async () => {
    if (claiming || !status) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/cross-gift/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: status.platform }),
      });
      if (res.ok || res.status === 409) {
        markFlyEarn();
        mutateFlyCaches();
        trackGrowthEvent('xplat_gift_claimed', { platform: status.platform });
        finish(true);
        return;
      }
      finish(false);
    } catch {
      finish(false);
    } finally {
      setClaiming(false);
    }
  };

  if (!overlayOpen || !status) return null;

  return (
    <GiftRevealOverlay
      eyebrow={
        status.platform === 'native'
          ? 'You hopped into the app!'
          : 'You hopped onto the web!'
      }
      headline="Your gift is here"
      prize={fliesPrize(status.flies)}
      fliesAmount={status.flies}
      claiming={claiming}
      onClaim={() => void handleClaim()}
    />
  );
}
