'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { Trackable } from '@/lib/questClaims';
import { buildTaskQuestChipLookup } from '@/lib/quests/taskQuestChip';

/**
 * Shares the home view's SWR entry rather than fetching its own, so surfacing
 * quest state next to the task input costs no extra request.
 */
export function useTaskQuestChipLookup() {
  const timezone =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const { data } = useSWR<{ trackables?: Trackable[] }>(
    typeof window === 'undefined'
      ? null
      : `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}`,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  return useMemo(
    () => buildTaskQuestChipLookup(data?.trackables),
    [data?.trackables],
  );
}
