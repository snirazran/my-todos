'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { hapticImpact } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import type {
  LookReactionKind,
  ReceivedReaction,
} from '@/lib/friends/lookReactions';

type ReactionsResponse = {
  reactions: ReceivedReaction[];
  unseenCount: number;
  sentToday: Record<string, LookReactionKind>;
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
    async (toUserId: string, kind: LookReactionKind) => {
      hapticImpact();
      mutate(
        (curr) =>
          curr
            ? { ...curr, sentToday: { ...curr.sentToday, [toUserId]: kind } }
            : curr,
        { revalidate: false },
      );
      try {
        await fetch('/api/friends/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId, kind, tz }),
        });
      } catch {
        mutate();
      }
    },
    [mutate, tz],
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
    react,
    markSeen,
  };
}
