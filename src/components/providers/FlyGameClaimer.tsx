'use client';

import { useEffect, useRef } from 'react';
import { mutate } from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { FLY_GAME_STORAGE_KEY } from '@/lib/flyGame';

type PendingReward = { runId: string; token: string; score: number };

function getPending(): PendingReward | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FLY_GAME_STORAGE_KEY) ?? '{}') as {
      pending?: PendingReward;
    };
    return stored.pending ?? null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FLY_GAME_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    delete stored.pending;
    window.localStorage.setItem(FLY_GAME_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
}

export function FlyGameClaimer() {
  const { user, loading } = useAuth();
  const claimingRef = useRef(false);

  useEffect(() => {
    if (loading || !user || claimingRef.current) return;
    const pending = getPending();
    if (!pending) return;
    claimingRef.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/fly-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'claim', runId: pending.runId, token: pending.token }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok || response.status === 409) clearPending();
        if (response.ok && typeof data.balance === 'number') {
          await Promise.all([
            mutate('/api/skins/inventory'),
            mutate('/api/skins/inventory?view=summary'),
          ]);
        }
      } finally {
        claimingRef.current = false;
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [loading, user]);

  return null;
}

