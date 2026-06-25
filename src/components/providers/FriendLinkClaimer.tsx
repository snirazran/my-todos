'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { mutate as swrMutate } from 'swr';

const STORAGE_KEY = 'frogress_friend_code';

/**
 * Captures a ?friend=CODE from the URL and stores it in localStorage, then
 * sends a friend request to that user the first time the viewer is
 * authenticated. The recipient approves it from their friend-invites inbox.
 */
export function FriendLinkClaimer() {
  const { user, loading } = useAuth();
  const claimedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('friend')?.trim();
      if (code) {
        localStorage.setItem(STORAGE_KEY, code);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
        const res = await fetch('/api/friends/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, source: 'link' }),
        });
        if (res.ok || res.status === 404 || res.status === 400) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          swrMutate('/api/friends');
          swrMutate('/api/friends/request');
        }
      } catch {
        // Will retry on next session
      }
    })();
  }, [user, loading]);

  return null;
}
