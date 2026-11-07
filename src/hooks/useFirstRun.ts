'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LOGIN_STREAK_HOLD,
  holdAutoPopups,
  releaseAutoPopups,
  usePopupGateStore,
} from '@/lib/popupGate';
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

export type FirstRunPhase =
  | 'off'
  | 'hungry'
  | 'yum'
  | 'streak';

export const FIRST_RUN_HOLD = 'first-run';

const FIRST_RUN_HOLD_MS = 30 * 60_000;
const FIRST_RUN_FLAG_KEY = 'frogress:first-run-pending';

export function markFirstRunPending() {
  try {
    window.localStorage.setItem(FIRST_RUN_FLAG_KEY, '1');
  } catch {}
}

export function clearFirstRunPending() {
  try {
    window.localStorage.removeItem(FIRST_RUN_FLAG_KEY);
  } catch {}
}

export function readFirstRunPending() {
  try {
    return window.localStorage.getItem(FIRST_RUN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}
const STREAK_WAIT_MS = 6000;
const YUM_MIN_MS = 1900;
const AFTER_STREAK_MS = 450;
const RELEASE_GRACE_MS = 2500;

const GUIDED: ReadonlySet<FirstRunPhase> = new Set<FirstRunPhase>([
  'hungry',
  'yum',
  'streak',
]);

export const FIRST_RUN_SPEECH: Partial<Record<FirstRunPhase, string>> = {
  hungry: 'I’m so hungry!\nFinish a task to feed me.',
  yum: 'Yum! First task done!',
  streak: 'Yum! First task done!',
};

export function useFirstRun({
  pending,
  ready,
  starterDone,
  onFinish,
}: {
  pending: boolean;
  ready: boolean;
  starterDone: boolean;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<FirstRunPhase>('off');
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const trackedPhasesRef = useRef(new Set<FirstRunPhase>());
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const streakHeld = usePopupGateStore((state) =>
    state.holds.includes(LOGIN_STREAK_HOLD),
  );
  const sheetOpen = useSheetStore((state) => state.count > 0);
  const setFirstRunGuided = useUIStore((state) => state.setFirstRunGuided);

  const finish = () => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      trackAnalyticsEvent('first_run_step', { step: 'finale' });
      onFinishRef.current();
    }
    setPhase('off');
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (startedRef.current || !pending || !ready) return;
    startedRef.current = true;
    if (starterDone) finishRef.current();
    else setPhase('hungry');
  }, [pending, ready, starterDone]);

  useEffect(() => {
    if (phase === 'hungry' && starterDone) setPhase('yum');
  }, [phase, starterDone]);

  const yumStartRef = useRef(0);
  useEffect(() => {
    if (phase === 'yum') yumStartRef.current = Date.now();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'yum') return;
    if (streakHeld) {
      const wait = Math.max(0, YUM_MIN_MS - (Date.now() - yumStartRef.current));
      const timer = window.setTimeout(() => setPhase('streak'), wait);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => finishRef.current(), STREAK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, streakHeld]);

  useEffect(() => {
    if (phase !== 'streak' || streakHeld || sheetOpen) return;
    const timer = window.setTimeout(() => finishRef.current(), AFTER_STREAK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, streakHeld, sheetOpen]);

  useEffect(() => {
    if (phase === 'off' || trackedPhasesRef.current.has(phase)) return;
    trackedPhasesRef.current.add(phase);
    trackAnalyticsEvent('first_run_step', { step: phase });
  }, [phase]);

  useEffect(() => {
    if (!startedRef.current) return;
    if (phase === 'streak') {
      releaseAutoPopups(FIRST_RUN_HOLD, 0);
    } else if (phase === 'off') {
      releaseAutoPopups(FIRST_RUN_HOLD, RELEASE_GRACE_MS);
    } else {
      holdAutoPopups(FIRST_RUN_HOLD, FIRST_RUN_HOLD_MS);
    }
  }, [phase]);

  useEffect(
    () => () => {
      releaseAutoPopups(FIRST_RUN_HOLD, 0);
      setFirstRunGuided(false);
    },
    [setFirstRunGuided],
  );

  const guided = GUIDED.has(phase) || (pending && !startedRef.current);

  useEffect(() => {
    setFirstRunGuided(guided);
  }, [guided, setFirstRunGuided]);

  return {
    phase,
    guided,
    active: phase !== 'off' || (pending && !startedRef.current),
    speech:
      FIRST_RUN_SPEECH[phase] ?? (pending && !startedRef.current ? FIRST_RUN_SPEECH.hungry! : null),
  };
}
