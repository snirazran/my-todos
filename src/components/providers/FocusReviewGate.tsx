'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  FocusReviewSheet,
  type PendingReview,
  type ReviewOutcome,
} from '@/components/ui/FocusReviewSheet';
import {
  SESSION_ENDED_EVENT,
  useFrogodoroStore,
  type SessionEndedDetail,
} from '@/lib/frogodoroStore';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';

type ReviewResponse = { session?: PendingReview | null };

const MIN_REVIEWABLE_FOCUS_SECONDS = 60;

// The bookkeeping half of ending a session. The "what next" half is answerable
// from the island, so a phone user has already chosen break-or-stop out there;
// this catches up whenever the app is next opened, and lands OVER a running
// break rather than blocking it.
export function FocusReviewGate() {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<PendingReview | null>(null);
  const [endedHere, setEndedHere] = useState<PendingReview | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const openSheets = useFrogodoroUiStore((state) => state.openSheets);

  const { data, mutate: refresh } = useSWR<ReviewResponse>(
    `/api/frogodoro/review?timezone=${encodeURIComponent(timezone)}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: true, refreshInterval: 90_000 },
  );

  useEffect(() => {
    const pending = endedHere ?? data?.session;
    if (!pending || open) return;
    if (dismissedRef.current.has(pending.id)) return;
    if (openSheets > 0) return;
    setReview(pending);
    setOpen(true);
  }, [endedHere, data?.session, open, openSheets]);

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const ended = (event as CustomEvent<SessionEndedDetail | undefined>)
        .detail;
      if (
        ended &&
        ended.focusSeconds >= MIN_REVIEWABLE_FOCUS_SECONDS &&
        !dismissedRef.current.has(ended.id)
      ) {
        setEndedHere({ ...ended, subjectTags: [] });
      }
      window.setTimeout(() => void refresh(), 400);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, [refresh]);

  const handleOutcome = useCallback(
    (outcome: ReviewOutcome) => {
      if (review) dismissedRef.current.add(review.id);
      setEndedHere(null);
      const store = useFrogodoroStore.getState();
      if (outcome.kind === 'break') {
        store.rotateSession();
        store.startBreak(outcome.seconds);
      } else if (outcome.kind === 'focus') {
        store.rotateSession();
        store.setFocusMinutes(outcome.seconds / 60);
        store.startTimer();
      }
      void refresh();
    },
    [review, refresh],
  );

  return (
    <FocusReviewSheet
      open={open}
      onOpenChange={setOpen}
      review={review}
      onOutcome={handleOutcome}
    />
  );
}

export default FocusReviewGate;
