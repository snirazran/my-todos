'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import type { LeapWeekResult } from '@/lib/leap/types';
import { LeapDaySheet } from './LeapDaySheet';
import { patchLeap, useLeapView } from './useLeapView';

const LEAP_DAY_HOLD = 'leap-day';

export function LeapHost() {
  const { user } = useAuth();
  const { data: view, mutate } = useLeapView(!!user);
  const [result, setResult] = useState<LeapWeekResult | null>(null);
  const [open, setOpen] = useState(false);
  const shownRef = useRef<string | null>(null);

  const pending = view?.enabled ? view.weekResult : null;
  useEffect(() => {
    if (!pending || shownRef.current === pending.weekKey) return;
    return whenScreenIsFree(
      () => {
        shownRef.current = pending.weekKey;
        setResult(pending);
        setOpen(true);
      },
      { dropAfterMs: 60_000, initialDelayMs: 1800 },
    );
  }, [pending]);

  useEffect(() => {
    if (open || !result) return;
    const timer = window.setTimeout(() => setResult(null), 450);
    return () => window.clearTimeout(timer);
  }, [open, result]);

  useAutoPopupHold(LEAP_DAY_HOLD, open);

  if (!user || !result) return null;
  return (
    <LeapDaySheet
      result={result}
      view={view}
      open={open}
      onClose={() => {
        setOpen(false);
        void patchLeap({ resultSeen: true }).then(() => mutate());
      }}
    />
  );
}
