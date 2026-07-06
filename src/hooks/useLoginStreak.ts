'use client';

import useSWR, { mutate as mutateGlobal } from 'swr';
import type {
  CheckInResult,
  LoginStreakRescue,
  LoginStreakView,
  RescueResult,
} from '@/lib/streak/types';

type StreakResponse = {
  active: boolean;
  view: LoginStreakView | null;
  rescue?: LoginStreakRescue | null;
};

function clientTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function streakKey() {
  return `/api/streak?timezone=${encodeURIComponent(clientTimezone())}`;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => r.json());

export function useLoginStreak(enabled: boolean = true) {
  const { data, isLoading } = useSWR<StreakResponse>(
    enabled ? streakKey() : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    view: data?.view ?? null,
    active: data?.active ?? true,
    isLoading,
  };
}

export function patchStreakView(view: LoginStreakView) {
  mutateGlobal(streakKey(), { active: true, view }, { revalidate: false });
}

export function revalidateStreak() {
  mutateGlobal(streakKey());
}

export async function checkInStreak(): Promise<CheckInResult | null> {
  try {
    const res = await fetch('/api/streak/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timezone: clientTimezone() }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as CheckInResult;
    if (result.view) patchStreakView(result.view);
    return result;
  } catch {
    return null;
  }
}

export async function rescueStreak(
  rescueId: string,
): Promise<RescueResult | null> {
  try {
    const res = await fetch('/api/streak/rescue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rescueId, timezone: clientTimezone() }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as RescueResult;
    if (result.completed && result.view) patchStreakView(result.view);
    return result;
  } catch {
    return null;
  }
}

export type StreakSheetRequest = {
  celebration?: CheckInResult | null;
  rescue?: LoginStreakRescue | null;
};

let sheetListener: ((req: StreakSheetRequest) => void) | null = null;
let pendingSheetRequest: StreakSheetRequest | null = null;

export function openStreakSheet(req: StreakSheetRequest = {}) {
  if (sheetListener) {
    sheetListener(req);
  } else {
    pendingSheetRequest = req;
  }
}

export function subscribeStreakSheet(cb: (req: StreakSheetRequest) => void) {
  sheetListener = cb;
  if (pendingSheetRequest) {
    const pending = pendingSheetRequest;
    pendingSheetRequest = null;
    cb(pending);
  }
  return () => {
    if (sheetListener === cb) sheetListener = null;
  };
}

export function localDayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToKey(dayKey: string, delta: number) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
