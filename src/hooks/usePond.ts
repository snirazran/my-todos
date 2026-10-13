'use client';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { mutateFriendsCaches } from './useFriendsSync';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import type { PondData, KeepsakeId } from '@/lib/friends/social';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export async function pondFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load. Try again.');
  return data;
}
export function usePond(enabled: boolean) {
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const { data, error, mutate } = useSWR<PondData>(enabled ? '/api/friends/pond?tz=' + encodeURIComponent(timezone) : null, pondFetcher, {
    refreshInterval: 15_000, revalidateOnFocus: true, refreshWhenHidden: false,
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const roomAction = useCallback(async (action: 'create' | 'join' | 'leave', options?: { roomId?: string; duration?: number }) => {
    if (busy) return null;
    setBusy(true); setActionError(null);
    try {
      const response = await fetch('/api/friends/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...options }) });
      const result = await response.json() as { error?: string; roomId?: string; timer?: ActiveFrogodoroTimer | null; serverNow?: number };
      if (!response.ok) throw new Error(result.error || 'Could not open this room. Try again.');
      if (result.timer) useFrogodoroStore.getState().hydrateActiveTimer(result.timer, result.serverNow);
      await mutate(); mutateFriendsCaches();
      return result.roomId ?? options?.roomId ?? null;
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not open this room. Try again.'); return null; }
    finally { setBusy(false); }
  }, [busy, mutate]);
  const pinKeepsake = useCallback(async (id: KeepsakeId | null) => {
    if (busy) return false;
    setBusy(true); setActionError(null);
    try {
      const response = await fetch('/api/friends/pond', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepsakeId: id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not wear this keepsake. Try again.');
      await mutate((current) => current ? { ...current, pinnedKeepsakeId: id } : current, { revalidate: false });
      mutateFriendsCaches(); return true;
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not wear this keepsake. Try again.'); return false; }
    finally { setBusy(false); }
  }, [busy, mutate]);
  return { data, error, mutate, busy, actionError, clearActionError: () => setActionError(null), roomAction, pinKeepsake };
}
