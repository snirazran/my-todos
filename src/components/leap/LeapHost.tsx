'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { warmImage } from '@/lib/imageWarmup';
import { useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import type { LeapHopResult, LeapJoin, LeapWeekResult } from '@/lib/leap/types';
import { leagueArt } from './leapCopy';
import { LeapDaySheet, revealLeapPrizes } from './LeapDaySheet';
import { LeapJoinSheet, openJoinGifts } from './LeapJoinSheet';
import { LeapZoneSheet, openZoneGifts, useLeapZoneMoment } from './LeapZoneSheet';
import { patchLeap, useLeapView } from './useLeapView';

const LEAP_DAY_HOLD = 'leap-day';
const REVEAL_AFTER_CLOSE_MS = 320;

export function LeapHost() {
  const { user } = useAuth();
  const { data: view, mutate } = useLeapView(!!user);
  const [result, setResult] = useState<LeapWeekResult | null>(null);
  const [open, setOpen] = useState(false);
  const [join, setJoin] = useState<LeapJoin | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [zone, setZone] = useState<LeapHopResult | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const shownRef = useRef<string | null>(null);
  const joinShownRef = useRef(false);
  const queuedZone = useLeapZoneMoment((state) => state.result);

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
    if (!queuedZone) return;
    warmImage(leagueArt(queuedZone.league), 'high');
    return whenScreenIsFree(
      () => {
        useLeapZoneMoment.setState({ result: null });
        setZone(queuedZone);
        setZoneOpen(true);
      },
      { dropAfterMs: 60_000, initialDelayMs: 900 },
    );
  }, [queuedZone]);

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

  useEffect(() => {
    if (zoneOpen || !zone) return;
    const timer = window.setTimeout(() => setZone(null), 450);
    return () => window.clearTimeout(timer);
  }, [zoneOpen, zone]);

  useAutoPopupHold(LEAP_DAY_HOLD, open || joinOpen || zoneOpen);

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
            if (openGift) window.setTimeout(() => openJoinGifts(join, view), REVEAL_AFTER_CLOSE_MS);
            void patchLeap({ joinSeen: true }).then(() => mutate());
          }}
        />
      )}
      {zone && (
        <LeapZoneSheet
          result={zone}
          view={view}
          open={zoneOpen}
          onClose={(openGift) => {
            setZoneOpen(false);
            if (openGift) window.setTimeout(() => openZoneGifts(zone), REVEAL_AFTER_CLOSE_MS);
          }}
        />
      )}
      {result && (
        <LeapDaySheet
          result={result}
          view={view}
          open={open}
          onClose={(openPrize) => {
            setOpen(false);
            if (openPrize) window.setTimeout(() => revealLeapPrizes(result, view), REVEAL_AFTER_CLOSE_MS);
            void patchLeap({ resultSeen: true }).then(() => mutate());
          }}
        />
      )}
    </>
  );
}
