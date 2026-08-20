import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import type { FrogIndices } from '@/lib/friends/indices';

export type BuddyTaskState = {
  bondId: string;
  status: 'pending' | 'active';
  invitedByMe: boolean;
  expiresAt: string | null;
  partnerName: string;
  partnerInitial: string;
  partnerIndices?: FrogIndices;
  oneTime?: boolean;
  partnerCompletedDates: string[];
  streak: number;
  pendingRepeatChange: { requestedByMe: boolean } | null;
};

const fetcher = bootstrapFetcher;

type BuddyStateResponse = {
  byTaskId: Record<string, BuddyTaskState>;
  bonusFlies?: number;
};

const FALLBACK_BONUS_FLIES = 5;

export function useBuddyState(active = true) {
  const { data } = useSWR<BuddyStateResponse>(
    active ? '/api/buddy/state' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.byTaskId ?? {};
}

/**
 * Flies each side is paid when both partners finish a shared occurrence. Read
 * live so copy can never drift from the admin-tuned economy config.
 */
export function useBuddyBonusFlies(active = true): number {
  const { data } = useSWR<BuddyStateResponse>(
    active ? '/api/buddy/state' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.bonusFlies ?? FALLBACK_BONUS_FLIES;
}

/**
 * Whether the user already has a live bond, so surfaces that pitch the feature
 * can stand down. `null` until the answer is known.
 */
export function useHasBuddy(active = true): boolean | null {
  const { data } = useSWR<BuddyStateResponse>(
    active ? '/api/buddy/state' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (!data) return null;
  return Object.keys(data.byTaskId ?? {}).length > 0;
}
