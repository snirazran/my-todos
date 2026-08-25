'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { hapticImpact } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { markFlyEarn } from '@/lib/flyEarn';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import type {
  LookReactionKind,
  ReceivedReaction,
} from '@/lib/friends/lookReactions';

type ReactionsResponse = {
  reactions: ReceivedReaction[];
  unseenCount: number;
  sentToday: Record<string, LookReactionKind>;
  cheerFlies?: number;
  cheerPaidLeft?: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLookReactions(enabled: boolean = true) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const key = enabled
    ? `/api/friends/reactions?tz=${encodeURIComponent(tz)}`
    : null;
  const { data, mutate } = useSWR<ReactionsResponse>(key, fetcher, {
    revalidateOnFocus: false,
  });

  const react = useCallback(
    async (toUserId: string, kind: LookReactionKind): Promise<number> => {
      hapticImpact();
      const isNew = !data?.sentToday?.[toUserId];
      mutate(
        (curr) =>
          curr
            ? {
                ...curr,
                sentToday: { ...curr.sentToday, [toUserId]: kind },
                cheerPaidLeft: isNew
                  ? Math.max(0, (curr.cheerPaidLeft ?? 0) - 1)
                  : curr.cheerPaidLeft,
              }
            : curr,
        { revalidate: false },
      );
      try {
        const res = await fetch('/api/friends/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId, kind, tz }),
        });
        const body = await res.json().catch(() => ({}));
        const earned = Math.max(0, Math.floor(body?.earned ?? 0));
        if (earned > 0) {
          markFlyEarn();
          mutateInventoryCaches();
        }
        return earned;
      } catch {
        mutate();
        return 0;
      }
    },
    [data?.sentToday, mutate, tz],
  );

  const markSeen = useCallback(async () => {
    if (!data?.unseenCount) return;
    trackAnalyticsEvent('look_reaction_seen', { count: data.unseenCount });
    mutate(
      (curr) =>
        curr
          ? {
              ...curr,
              unseenCount: 0,
              reactions: curr.reactions.map((r) => ({ ...r, seen: true })),
            }
          : curr,
      { revalidate: false },
    );
    try {
      await fetch('/api/friends/reactions', { method: 'PATCH' });
    } catch {
      mutate();
    }
  }, [data?.unseenCount, mutate]);

  return {
    reactions: data?.reactions ?? [],
    unseenCount: data?.unseenCount ?? 0,
    sentToday: data?.sentToday ?? {},
    cheerFlies: data?.cheerFlies ?? 0,
    cheerPaidLeft: data?.cheerPaidLeft ?? 0,
    react,
    markSeen,
  };
}
