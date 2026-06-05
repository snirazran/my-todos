'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { mutate as swrMutate } from 'swr';

const STORAGE_KEY = 'frogress_referral_code';

/**
 * Captures a ?ref=CODE from the URL and stores it in localStorage,
 * then attempts to claim the referral the first time the user is
 * authenticated.
 */
export function ReferralClaimer() {
  const { user, loading } = useAuth();
  const claimedRef = useRef(false);

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
        const res = await fetch('/api/invite/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (res.ok || res.status === 409 || res.status === 400) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          // Refresh inventory/wallet caches so the new gift appears
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/skins'));
          swrMutate((key) => typeof key === 'string' && key.startsWith('/api/backgrounds'));
        }
      } catch {
        // Will retry on next session
      }
    })();
  }, [user, loading]);

  return null;
}
