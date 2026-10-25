'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { useQuestRevealActive } from '@/components/ui/questRewardReveal';
import { warmImage } from '@/lib/imageWarmup';
import { holdAutoPopups, useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import type { LeapHopResult, LeapJoin, LeapWeekResult } from '@/lib/leap/types';
import { leagueArt } from './leapCopy';
import { LeapDaySheet, revealLeapPrizes } from './LeapDaySheet';
import { LeapJoinSheet, openJoinGifts } from './LeapJoinSheet';
import {
  LeapZoneSheet,
  openZoneGifts,
  queueLeapZoneMoment,
  useLeapZoneMoment,
} from './LeapZoneSheet';
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
  const [retry, setRetry] = useState(0);
  const shownRef = useRef<string | null>(null);
  const joinShownRef = useRef(false);
  const queuedZone = useLeapZoneMoment((state) => state.result);

  const stageOpen = open || joinOpen || zoneOpen;
  const otherSheet = useSheetStore((state) => state.count > 1);
  const revealActive = useQuestRevealActive();
  const cinematic = useUIStore((state) => state.isCinematicActive);
  const hinting = useUIStore((state) => !!state.activeHint);
  const crowded = stageOpen && (otherSheet || revealActive || cinematic || hinting);

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
        holdAutoPopups(LEAP_DAY_HOLD);
        joinShownRef.current = true;
        setJoin(pendingJoin);
        setJoinOpen(true);
      },
      { dropAfterMs: 120_000, initialDelayMs: 1400 },
    );
  }, [pendingJoin, retry]);

  useEffect(() => {
    if (!queuedZone) return;
    warmImage(leagueArt(queuedZone.league), 'high');
    return whenScreenIsFree(
      () => {
        holdAutoPopups(LEAP_DAY_HOLD);
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
        holdAutoPopups(LEAP_DAY_HOLD);
        shownRef.current = pending.weekKey;
        setResult(pending);
        setOpen(true);
      },
      { dropAfterMs: 60_000, initialDelayMs: 1800 },
    );
  }, [pending, pendingJoin, joinOpen, retry]);

  useEffect(() => {
    if (!crowded) return;
    if (joinOpen) {
      joinShownRef.current = false;
      setJoinOpen(false);
    }
    if (zoneOpen && zone) {
      setZoneOpen(false);
      queueLeapZoneMoment(zone);
    }
    if (open) {
      shownRef.current = null;
      setOpen(false);
    }
    setRetry((count) => count + 1);
  }, [crowded, joinOpen, zoneOpen, zone, open]);

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

  useAutoPopupHold(LEAP_DAY_HOLD, stageOpen);

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
