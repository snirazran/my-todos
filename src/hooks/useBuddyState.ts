import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

export type BuddyTaskState = {
  bondId: string;
  partnerName: string;
  partnerInitial: string;
  partnerCompletedDates: string[];
  streak: number;
  pendingRepeatChange: { requestedByMe: boolean } | null;
};

const fetcher = bootstrapFetcher;

export function useBuddyState(active = true) {
  const { data } = useSWR<{ byTaskId: Record<string, BuddyTaskState> }>(
    active ? '/api/buddy/state' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return data?.byTaskId ?? {};
}
