'use client';

import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';
import { useCampaignStore } from '@/lib/campaigns/orchestrator';
import { isScreenBusy } from '@/lib/popupGate';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

export type RatingMoment = 'quest_reward' | 'clean_sweep' | 'streak_goal';
export type NegativeMoment = 'streak_broken' | 'ad_failed' | 'purchase_failed';

const USAGE_DAYS_KEY = 'rate-app:usage-days';
const PROMPTS_KEY = 'rate-app:prompts';
const POSITIVE_KEY = 'rate-app:positive-moments';
const NEGATIVE_AT_KEY = 'rate-app:negative-at';
const VERSION_KEY = 'rate-app:prompted-version';

const MIN_USAGE_DAYS = 3;
const MIN_POSITIVE_MOMENTS = 3;
const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const NEGATIVE_QUIET_MS = 2 * DAY_MS;
const PROMPT_DELAY_MS = 1200;

const PLATFORM_POLICY = {
  ios: { cooldownMs: 120 * DAY_MS, maxPerYear: 3 },
  android: { cooldownMs: 30 * DAY_MS, maxPerYear: 6 },
} as const;

let requestInFlight = false;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function policy() {
  return Capacitor.getPlatform() === 'android'
    ? PLATFORM_POLICY.android
    : PLATFORM_POLICY.ios;
}

function recentPrompts(now: number) {
  return readJson<number[]>(PROMPTS_KEY, []).filter(
    (ts) => Number.isFinite(ts) && now - ts < YEAR_MS,
  );
}

function interrupted() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return true;
  }
  const { active, pending, busyReasons } = useCampaignStore.getState();
  return !!active || !!pending || busyReasons.length > 0 || isScreenBusy();
}

async function appVersion(): Promise<string | null> {
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return `${info.version}(${info.build})`;
  } catch {
    return null;
  }
}

export function recordAppUsageDay() {
  if (typeof window === 'undefined') return;
  const today = localDayKey();
  const days = readJson<string[]>(USAGE_DAYS_KEY, []);
  if (days.includes(today)) return;
  writeJson(USAGE_DAYS_KEY, [...days, today].slice(-30));
}

export function markNegativeMoment(reason: NegativeMoment) {
  if (typeof window === 'undefined') return;
  writeString(NEGATIVE_AT_KEY, String(Date.now()));
  trackAnalyticsEvent('app_review_suppressed', { reason });
}

export function maybeRequestAppRating(moment: RatingMoment) {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;

  const positive = (Number(readString(POSITIVE_KEY)) || 0) + 1;
  writeString(POSITIVE_KEY, String(positive));

  if (requestInFlight) return;
  if (positive < MIN_POSITIVE_MOMENTS) return;

  const usageDays = readJson<string[]>(USAGE_DAYS_KEY, []);
  if (usageDays.length < MIN_USAGE_DAYS) return;

  const now = Date.now();
  const negativeAt = Number(readString(NEGATIVE_AT_KEY)) || 0;
  if (now - negativeAt < NEGATIVE_QUIET_MS) return;

  const { cooldownMs, maxPerYear } = policy();
  const prompts = recentPrompts(now);
  if (prompts.length >= maxPerYear) return;
  if (prompts.some((ts) => now - ts < cooldownMs)) return;
  if (interrupted()) return;

  requestInFlight = true;
  window.setTimeout(async () => {
    try {
      const version = await appVersion();
      if (version && readString(VERSION_KEY) === version) return;
      if (interrupted()) return;
      await InAppReview.requestReview();
      const at = Date.now();
      writeJson(PROMPTS_KEY, [...recentPrompts(at), at]);
      if (version) writeString(VERSION_KEY, version);
      trackAnalyticsEvent('app_review_requested', {
        moment,
        attempt: recentPrompts(at).length,
        usage_days: usageDays.length,
        positive_moments: positive,
      });
    } catch {
    } finally {
      requestInFlight = false;
    }
  }, PROMPT_DELAY_MS);
}
