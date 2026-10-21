'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { TASK_SYNC_EVENT } from '@/lib/taskSyncClient';

type FriendsBadgeData = {
  claimable?: number;
  gate?: { required: number; done: number; open: boolean };
};

let refreshing: Promise<unknown> | null = null;

export function useFriendPondBadge() {
  const { user } = useAuth();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, mutate } = useSWR<FriendsBadgeData>(
    user ? `/api/friends?tz=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const owed = data?.claimable ?? 0;
  const gated = owed > 0 && data?.gate?.open === false;

  useEffect(() => {
    if (!gated) return;
    const onTaskSync = () => {
      refreshing ??= mutate().finally(() => {
        refreshing = null;
      });
    };
    window.addEventListener(TASK_SYNC_EVENT, onTaskSync);
    return () => window.removeEventListener(TASK_SYNC_EVENT, onTaskSync);
  }, [gated, mutate]);

  return gated ? 0 : owed;
}
