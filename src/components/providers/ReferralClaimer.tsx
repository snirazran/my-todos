'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { mutate as swrMutate } from 'swr';
import { GiftClaimRewardOverlay } from '@/components/ui/GiftClaimRewardOverlay';
import { SharedTaskClaimPopup } from '@/components/ui/SharedTaskClaimPopup';
import type { ItemDef } from '@/lib/skins/catalog';

const STORAGE_KEY = 'frogress_referral_code';

/**
 * Captures a ?ref=CODE from the URL and stores it in localStorage,
 * then attempts to claim the referral the first time the user is
 * authenticated.
 */
export function ReferralClaimer() {
  const { user, loading } = useAuth();
  const claimedRef = useRef(false);
  const [claimedGift, setClaimedGift] = useState<{
    gift: ItemDef;
    inviterName: string;
  } | null>(null);
  const [sharedTask, setSharedTask] = useState<{
    text: string;
    partnerName: string;
  } | null>(null);

  // Capture ?ref=CODE on mount and persist it
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('ref')?.trim();
      if (code) {
        localStorage.setItem(STORAGE_KEY, code);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // When a user becomes authenticated, try to redeem any stored code
  useEffect(() => {
    if (loading || !user) return;
    if (claimedRef.current) return;
    if (typeof window === 'undefined') return;

    const code = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!code) return;

    claimedRef.current = true;
    void (async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const res = await fetch('/api/invite/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, tz }),
        });
        if (res.ok || res.status === 409 || res.status === 400) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          // Refresh inventory/wallet/friends caches so the new gift and
          // friendship appear immediately.
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/skins'));
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/backgrounds'));
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/friends'));

          try {
            const data = await res.json();
            const inviterName =
              typeof data.inviterName === 'string' ? data.inviterName : 'A friend';
            if (data?.gift) {
              setClaimedGift({ gift: data.gift as ItemDef, inviterName });
            }
            if (data?.buddyTask?.text) {
              swrMutate((key) => typeof key === 'string' && key.startsWith('/api/tasks'));
              setSharedTask({
                text: String(data.buddyTask.text),
                partnerName:
                  typeof data.buddyTask.partnerName === 'string'
                    ? data.buddyTask.partnerName
                    : inviterName,
              });
            }
          } catch {
            /* no reward payload */
          }
        }
      } catch {
        // Will retry on next session
      }
    })();
  }, [user, loading]);

  if (claimedGift) {
    return (
      <GiftClaimRewardOverlay
        gift={claimedGift.gift}
        inviterName={claimedGift.inviterName}
        onClose={() => setClaimedGift(null)}
      />
    );
  }

  if (sharedTask) {
    return (
      <SharedTaskClaimPopup
        text={sharedTask.text}
        partnerName={sharedTask.partnerName}
        onClose={() => setSharedTask(null)}
      />
    );
  }

  return null;
}
