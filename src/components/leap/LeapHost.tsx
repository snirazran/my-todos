'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { warmImage } from '@/lib/imageWarmup';
import { useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import type { LeapJoin, LeapWeekResult } from '@/lib/leap/types';
import { leagueArt } from './leapCopy';
import { LeapDaySheet } from './LeapDaySheet';
import { LeapJoinSheet, openJoinGifts } from './LeapJoinSheet';
import { patchLeap, useLeapView } from './useLeapView';

const LEAP_DAY_HOLD = 'leap-day';

export function LeapHost() {
  const { user } = useAuth();
  const { data: view, mutate } = useLeapView(!!user);
  const [result, setResult] = useState<LeapWeekResult | null>(null);
  const [open, setOpen] = useState(false);
  const [join, setJoin] = useState<LeapJoin | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const shownRef = useRef<string | null>(null);
  const joinShownRef = useRef(false);

  const pendingJoin = view?.enabled ? view.join : null;
  const pending = view?.enabled ? view.weekResult : null;
  useEffect(() => {
    if (!pending) return;
    warmImage(leagueArt(pending.leagueBefore), 'high');
    warmImage(leagueArt(pending.leagueAfter), 'high');
  }, [pending]);

  useEffect(() => {
    if (!pendingJoin || joinShownRef.current) return;
    return whenScreenIsFree(
      () => {
        joinShownRef.current = true;
        setJoin(pendingJoin);
        setJoinOpen(true);
      },
      { dropAfterMs: 120_000, initialDelayMs: 1400 },
    );
  }, [pendingJoin]);

  useEffect(() => {
    if (!pending || pendingJoin || joinOpen || shownRef.current === pending.weekKey) return;
    return whenScreenIsFree(
      () => {
        shownRef.current = pending.weekKey;
        setResult(pending);
        setOpen(true);
      },
      { dropAfterMs: 60_000, initialDelayMs: 1800 },
    );
  }, [pending, pendingJoin, joinOpen]);

  useEffect(() => {
    if (open || !result) return;
    const timer = window.setTimeout(() => setResult(null), 450);
    return () => window.clearTimeout(timer);
  }, [open, result]);

  useEffect(() => {
    if (joinOpen || !join) return;
    const timer = window.setTimeout(() => setJoin(null), 450);
    return () => window.clearTimeout(timer);
  }, [joinOpen, join]);

  useAutoPopupHold(LEAP_DAY_HOLD, open || joinOpen);

  if (!user || !view) return null;
  return (
    <>
      {join && (
        <LeapJoinSheet
          join={join}
          view={view}
          open={joinOpen}
          onClose={(openGift) => {
            setJoinOpen(false);
            if (openGift) window.setTimeout(() => openJoinGifts(join, view), 320);
            void patchLeap({ joinSeen: true }).then(() => mutate());
          }}
        />
      )}
      {result && (
        <LeapDaySheet
          result={result}
          view={view}
          open={open}
          onClose={() => {
            setOpen(false);
            void patchLeap({ resultSeen: true }).then(() => mutate());
          }}
        />
      )}
    </>
  );
}
