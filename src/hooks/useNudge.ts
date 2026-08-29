'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { claimBlockingSlot } from '@/lib/campaigns/orchestrator';

const HOUR_MS = 3600_000;

type NudgeConfig = {
  maxImpressions: number;
  cooldownHours: number;
  suppressAfterDismissals: number;
  minVisits: number;
  blocking: boolean;
};

const NUDGES = {
  home_buddy: {
    maxImpressions: 5,
    cooldownHours: 48,
    suppressAfterDismissals: 2,
    minVisits: 2,
    blocking: false,
  },
  friends_buddy: {
    maxImpressions: 2,
    cooldownHours: 24 * 7,
    suppressAfterDismissals: 1,
    minVisits: 2,
    blocking: true,
  },
  planner_calendar: {
    maxImpressions: 3,
    cooldownHours: 72,
    suppressAfterDismissals: 2,
    minVisits: 2,
    blocking: true,
  },
} satisfies Record<string, NudgeConfig>;

export type NudgeKey = keyof typeof NUDGES;

type NudgeRecord = {
  visits: number;
  impressions: number;
  dismissals: number;
  lastShownAt: number;
  suppressed: boolean;
};

const EMPTY: NudgeRecord = {
  visits: 0,
  impressions: 0,
  dismissals: 0,
  lastShownAt: 0,
  suppressed: false,
};

let sessionClaim: NudgeKey | null = null;

const storageKey = (key: NudgeKey, uid: string) => `frogress.nudge.${key}.${uid}`;

function readRecord(key: NudgeKey, uid: string): NudgeRecord {
  try {
    const raw = window.localStorage.getItem(storageKey(key, uid));
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<NudgeRecord>) };
  } catch {
    return { ...EMPTY };
  }
}

function writeRecord(
  key: NudgeKey,
  uid: string,
  patch: Partial<NudgeRecord>,
): NudgeRecord {
  const next = { ...readRecord(key, uid), ...patch };
  try {
    window.localStorage.setItem(storageKey(key, uid), JSON.stringify(next));
  } catch {
    /* best effort */
  }
  return next;
}

function readyAt(record: NudgeRecord, config: NudgeConfig) {
  if (!record.lastShownAt) return 0;
  return record.lastShownAt + config.cooldownHours * 3 ** record.dismissals * HOUR_MS;
}

export function useNudge(
  key: NudgeKey,
  { enabled = true, delayMs = 0 }: { enabled?: boolean; delayMs?: number } = {},
) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const config: NudgeConfig = NUDGES[key];
  const [show, setShow] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !uid || decidedRef.current) return;
    decidedRef.current = true;

    const previous = readRecord(key, uid);
    const record = writeRecord(key, uid, { visits: previous.visits + 1 });

    if (record.suppressed) return;
    if (record.dismissals >= config.suppressAfterDismissals) return;
    if (record.impressions >= config.maxImpressions) return;
    if (record.visits < config.minVisits) return;
    if (Date.now() < readyAt(record, config)) return;

    const timer = window.setTimeout(() => {
      if (sessionClaim && sessionClaim !== key) return;
      if (config.blocking && !claimBlockingSlot()) return;
      sessionClaim = key;
      writeRecord(key, uid, {
        impressions: record.impressions + 1,
        lastShownAt: Date.now(),
      });
      setShow(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [key, uid, enabled, delayMs, config]);

  const dismiss = useCallback(() => {
    setShow(false);
    if (!uid) return;
    writeRecord(key, uid, {
      dismissals: readRecord(key, uid).dismissals + 1,
      lastShownAt: Date.now(),
    });
  }, [key, uid]);

  const engage = useCallback(() => {
    setShow(false);
    if (uid) writeRecord(key, uid, { lastShownAt: Date.now() });
  }, [key, uid]);

  const suppress = useCallback(() => {
    setShow(false);
    if (uid) writeRecord(key, uid, { suppressed: true });
  }, [key, uid]);

  /**
   * Show now because the user just earned the moment, skipping the visit count
   * and cooldown that pace an unprompted nudge. The ceilings that stop it being
   * a pest — suppression, dismissals, total impressions — still apply, and the
   * impression is recorded so the paced path picks up where this leaves off.
   */
  const present = useCallback(() => {
    if (!uid) return false;
    const record = readRecord(key, uid);
    if (record.suppressed) return false;
    if (record.dismissals >= config.suppressAfterDismissals) return false;
    if (record.impressions >= config.maxImpressions) return false;
    if (sessionClaim && sessionClaim !== key) return false;
    if (config.blocking && !claimBlockingSlot()) return false;
    sessionClaim = key;
    writeRecord(key, uid, {
      impressions: record.impressions + 1,
      lastShownAt: Date.now(),
    });
    setShow(true);
    return true;
  }, [key, uid, config]);

  return { show, dismiss, engage, suppress, present };
}
