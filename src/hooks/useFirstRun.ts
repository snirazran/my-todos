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

export type FirstRunPhase =
  | 'off'
  | 'hungry'
  | 'yum'
  | 'streak'
  | 'quest'
  | 'claiming'
  | 'finale';

export const FIRST_RUN_HOLD = 'first-run';

const FIRST_RUN_HOLD_MS = 30 * 60_000;
const STREAK_WAIT_MS = 6000;
const AFTER_STREAK_MS = 450;
const MISSING_CLAIM_MS = 4000;
const FINALE_MS = 7000;
const RELEASE_GRACE_MS = 2500;

const GUIDED: ReadonlySet<FirstRunPhase> = new Set<FirstRunPhase>([
  'hungry',
  'yum',
  'streak',
  'quest',
  'claiming',
]);

export const FIRST_RUN_SPEECH: Partial<Record<FirstRunPhase, string>> = {
  hungry: 'I’m so hungry!\nTap the fly to feed me.',
  yum: 'Yum! Thank you!',
  streak: 'Yum! Thank you!',
  quest: 'You earned a reward!\nTap Claim to collect it.',
  claiming: 'You earned a reward!\nTap Claim to collect it.',
  finale: 'What else is on your list?\nTap + to add it.',
};

export function useFirstRun({
  pending,
  ready,
  starterDone,
  hasClaim,
  revealCount,
  onFinish,
}: {
  pending: boolean;
  ready: boolean;
  starterDone: boolean;
  hasClaim: boolean;
  revealCount: number;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<FirstRunPhase>('off');
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const streakHeld = usePopupGateStore((state) =>
    state.holds.includes(LOGIN_STREAK_HOLD),
  );
  const sheetOpen = useSheetStore((state) => state.count > 0);
  const setFirstRunGuided = useUIStore((state) => state.setFirstRunGuided);

  useEffect(() => {
    if (startedRef.current || !pending || !ready) return;
    startedRef.current = true;
    setPhase(!starterDone ? 'hungry' : hasClaim ? 'quest' : 'finale');
  }, [pending, ready, starterDone, hasClaim]);

  useEffect(() => {
    if (phase === 'hungry' && starterDone) setPhase('yum');
  }, [phase, starterDone]);

  useEffect(() => {
    if (phase !== 'yum') return;
    if (streakHeld) {
      setPhase('streak');
      return;
    }
    const timer = window.setTimeout(() => setPhase('quest'), STREAK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, streakHeld]);

  useEffect(() => {
    if (phase !== 'streak' || streakHeld || sheetOpen) return;
    const timer = window.setTimeout(() => setPhase('quest'), AFTER_STREAK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, streakHeld, sheetOpen]);

  useEffect(() => {
    if (phase !== 'quest') return;
    if (revealCount > 0) {
      setPhase('claiming');
      return;
    }
    if (hasClaim) return;
    const timer = window.setTimeout(() => setPhase('finale'), MISSING_CLAIM_MS);
    return () => window.clearTimeout(timer);
  }, [phase, revealCount, hasClaim]);

  useEffect(() => {
    if (phase !== 'claiming' || revealCount > 0 || sheetOpen) return;
    const timer = window.setTimeout(() => setPhase('finale'), AFTER_STREAK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, revealCount, sheetOpen]);

  useEffect(() => {
    if (phase !== 'finale') return;
    if (!finishedRef.current) {
      finishedRef.current = true;
      onFinishRef.current();
    }
    const timer = window.setTimeout(() => setPhase('off'), FINALE_MS);
    return () => window.clearTimeout(timer);
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
    speech: FIRST_RUN_SPEECH[phase] ?? null,
  };
}
