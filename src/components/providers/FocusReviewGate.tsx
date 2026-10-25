'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  FocusWrapUp,
  type PendingReview,
  type ReviewOutcome,
  type WrapUpOrigin,
  type WrapUpScene,
} from '@/components/ui/FocusWrapUp';
import {
  SESSION_ENDED_EVENT,
  endedSessionDetail,
  isFocusWrapUp,
  lapsedFocusDetail,
  useFrogodoroStore,
  type SessionEndedDetail,
} from '@/lib/frogodoroStore';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';

type ReviewResponse = { session?: PendingReview | null };

const MIN_REVIEWABLE_FOCUS_SECONDS = 60;
const RETURN_WINDOW_MS = 8000;
const DEEP_FOCUS_MIN_SECONDS = 15 * 60;

function focusCardOrigin(): WrapUpOrigin | null {
  const card = document.querySelector<HTMLElement>('[data-focus-card]');
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    top: Math.max(0, rect.top),
    right: Math.max(0, window.innerWidth - rect.right),
    bottom: Math.max(0, window.innerHeight - rect.bottom),
    left: Math.max(0, rect.left),
  };
}

// The bookkeeping half of ending a session. The "what next" half is answerable
// from the island, so a phone user has already chosen break-or-stop out there;
// this catches up whenever the app is next opened, and lands OVER a running
// break rather than blocking it.
export function FocusReviewGate() {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<PendingReview | null>(null);
  const [scene, setScene] = useState<WrapUpScene | null>(null);
  const [endedHere, setEndedHere] = useState<PendingReview | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const returnedAtRef = useRef(Date.now());
  const openRef = useRef(open);
  openRef.current = open;
  const lapsedIdRef = useRef<string | null>(null);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const openSheets = useFrogodoroUiStore((state) => state.openSheets);
  const setWrapUpOpen = useFrogodoroUiStore((state) => state.setWrapUpOpen);
  const focusWrapUp = useFrogodoroStore(isFocusWrapUp);
  const awaitingDone = useFrogodoroStore((state) => state.awaitingDone);

  const { data, mutate: refresh } = useSWR<ReviewResponse>(
    `/api/frogodoro/review?timezone=${encodeURIComponent(timezone)}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: true, refreshInterval: 90_000 },
  );

  useEffect(() => {
    setWrapUpOpen(open);
  }, [open, setWrapUpOpen]);
  useEffect(() => () => setWrapUpOpen(false), [setWrapUpOpen]);

  const openLapsedFocus = useCallback(() => {
    if (openRef.current) return;
    const lapsed = lapsedFocusDetail();
    if (!lapsed || dismissedRef.current.has(lapsed.id)) return;
    const store = useFrogodoroStore.getState();
    openRef.current = true;
    lapsedIdRef.current = lapsed.id;
    setReview({ ...lapsed, subjectTags: [] });
    setScene({
      later: true,
      origin: focusCardOrigin(),
      sessionFocusSeconds:
        store.sessionStats.focusTime +
        Math.max(0, lapsed.focusSeconds - store.phaseElapsed),
      bonusFly:
        store.deepFocus &&
        !store.pausedThisPhase &&
        lapsed.focusSeconds >= DEEP_FOCUS_MIN_SECONDS,
      nextLocked: false,
    });
    setEndedHere(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let appStateHandle: { remove: () => void } | null = null;
    const onReturn = () => {
      returnedAtRef.current = Date.now();
      openLapsedFocus();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onReturn();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !cancelled) onReturn();
      })
        .then((handle) => {
          if (cancelled) handle.remove();
          else appStateHandle = handle;
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      appStateHandle?.remove();
    };
  }, [openLapsedFocus]);

  const acknowledge = useCallback(() => {
    const store = useFrogodoroStore.getState();
    if (!isFocusWrapUp(store) && !lapsedFocusDetail()) return;
    store.setAwaitingDone(false);
    store.stopTimer();
  }, []);

  useLayoutEffect(() => {
    if (!open || !awaitingDone) return;
    const store = useFrogodoroStore.getState();
    if (!lapsedIdRef.current || lapsedIdRef.current !== store.sessionId) return;
    store.setAwaitingDone(false);
    store.stopTimer();
  }, [open, awaitingDone]);

  useLayoutEffect(() => {
    if (!focusWrapUp || open) return;
    const ended = endedSessionDetail();
    if (!ended || dismissedRef.current.has(ended.id)) {
      acknowledge();
      return;
    }
    const store = useFrogodoroStore.getState();
    lapsedIdRef.current = null;
    setReview({ ...ended, subjectTags: [] });
    setScene({
      later: Date.now() - returnedAtRef.current < RETURN_WINDOW_MS / 2,
      origin: focusCardOrigin(),
      sessionFocusSeconds: store.sessionStats.focusTime,
      bonusFly:
        store.deepFocus &&
        !store.lastPhasePaused &&
        store.lastFocusElapsed >= DEEP_FOCUS_MIN_SECONDS,
      nextLocked: false,
    });
    setEndedHere(null);
    setOpen(true);
  }, [focusWrapUp, open, acknowledge]);

  useEffect(() => {
    const pending = endedHere ?? data?.session;
    if (!pending || open) return;
    if (dismissedRef.current.has(pending.id)) return;
    if (openSheets > 0 || awaitingDone) return;
    lapsedIdRef.current = null;
    setReview(pending);
    setScene({
      later: !endedHere && Date.now() - returnedAtRef.current < RETURN_WINDOW_MS,
      origin: null,
      sessionFocusSeconds: null,
      bonusFly: false,
      nextLocked: useFrogodoroStore.getState().timerActive,
    });
    setOpen(true);
  }, [endedHere, data?.session, open, openSheets, awaitingDone]);

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const ended = (event as CustomEvent<SessionEndedDetail | undefined>)
        .detail;
      if (
        ended &&
        (ended.forceReview ||
          ended.focusSeconds >= MIN_REVIEWABLE_FOCUS_SECONDS) &&
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
      acknowledge();
      if (review) dismissedRef.current.add(review.id);
      lapsedIdRef.current = null;
      setEndedHere(null);
      setOpen(false);
      const store = useFrogodoroStore.getState();
      if (outcome.kind === 'break') {
        store.rotateSession();
        store.startBreak(outcome.seconds);
        store.setPhaseElapsedResult('focus', 0);
      } else if (outcome.kind === 'focus') {
        store.rotateSession();
        store.setFocusMinutes(outcome.seconds / 60);
        store.startTimer();
      }
      void refresh();
    },
    [review, refresh, acknowledge],
  );

  return (
    <FocusWrapUp
      open={open}
      review={review}
      scene={scene}
      onAcknowledge={acknowledge}
      onOutcome={handleOutcome}
    />
  );
}

export default FocusReviewGate;
