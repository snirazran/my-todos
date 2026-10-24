'use client';

import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';
import { useCampaignStore } from '@/lib/campaigns/orchestrator';
import { isScreenBusy } from '@/lib/popupGate';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { auth } from '@/lib/firebase';

export type RatingMoment = 'quest_reward' | 'clean_sweep' | 'streak_goal';
export type NegativeMoment = 'streak_broken' | 'ad_failed' | 'purchase_failed';

const USAGE_DAYS_KEY = 'rate-app:usage-days';
const PROMPTS_KEY = 'rate-app:prompts';
const POSITIVE_KEY = 'rate-app:positive-moments';
const NEGATIVE_AT_KEY = 'rate-app:negative-at';
const VERSION_KEY = 'rate-app:prompted-version';

const MIN_USAGE_DAYS = 2;
const MIN_POSITIVE_MOMENTS = 2;
const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const NEGATIVE_QUIET_MS = 2 * DAY_MS;
const PROMPT_DELAY_MS = 1200;
const SCREEN_POLL_MS = 400;
const SCREEN_WAIT_MS = 8000;

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

function accountKey(base: string) {
  const uid = auth?.currentUser?.uid;
  return uid ? `${base}:${uid}` : base;
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

function campaignBlocker() {
  const { active, pending } = useCampaignStore.getState();
  if (active) return 'campaign_open';
  if (pending) return 'campaign_pending';
  return null;
}

function screenBlocker() {
  const { busyReasons } = useCampaignStore.getState();
  if (busyReasons.length > 0) return busyReasons[0];
  return isScreenBusy() ? 'screen' : null;
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
  const days = readJson<string[]>(accountKey(USAGE_DAYS_KEY), []);
  if (days.includes(today)) return;
  writeJson(accountKey(USAGE_DAYS_KEY), [...days, today].slice(-30));
}

export function markNegativeMoment(reason: NegativeMoment) {
  if (typeof window === 'undefined') return;
  writeString(NEGATIVE_AT_KEY, String(Date.now()));
  trackAnalyticsEvent('app_review_suppressed', { reason });
}

export function maybeRequestAppRating(moment: RatingMoment) {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;

  const positive = (Number(readString(accountKey(POSITIVE_KEY))) || 0) + 1;
  writeString(accountKey(POSITIVE_KEY), String(positive));

  if (requestInFlight) return;

  const usageDays = readJson<string[]>(accountKey(USAGE_DAYS_KEY), []);
  const skip = (reason: string, blocker?: string) =>
    trackAnalyticsEvent('app_review_skipped', {
      moment,
      reason,
      ...(blocker ? { blocker } : {}),
      usage_days: usageDays.length,
      positive_moments: positive,
    });

  if (positive < MIN_POSITIVE_MOMENTS) return skip('few_good_moments');
  if (usageDays.length < MIN_USAGE_DAYS) return skip('few_usage_days');

  const now = Date.now();
  const negativeAt = Number(readString(NEGATIVE_AT_KEY)) || 0;
  if (now - negativeAt < NEGATIVE_QUIET_MS) return skip('bad_moment_pause');

  const { cooldownMs, maxPerYear } = policy();
  const prompts = recentPrompts(now);
  if (prompts.length >= maxPerYear) return skip('yearly_cap');
  if (prompts.some((ts) => now - ts < cooldownMs)) return skip('cooldown');

  requestInFlight = true;
  const deadline = Date.now() + SCREEN_WAIT_MS;

  const request = async () => {
    try {
      const version = await appVersion();
      if (version && readString(VERSION_KEY) === version) {
        skip('asked_this_version');
        return;
      }
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
      skip('plugin_error');
    } finally {
      requestInFlight = false;
    }
  };

  const tryRequest = () => {
    const stop = (reason: string, blocker?: string) => {
      requestInFlight = false;
      skip(reason, blocker);
    };
    if (document.visibilityState !== 'visible') return stop('app_hidden');
    const campaign = campaignBlocker();
    if (campaign) return stop('campaign', campaign);
    const busy = screenBlocker();
    if (!busy) return void request();
    if (Date.now() > deadline) return stop('busy', busy);
    window.setTimeout(tryRequest, SCREEN_POLL_MS);
  };

  window.setTimeout(tryRequest, PROMPT_DELAY_MS);
}
