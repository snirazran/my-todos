'use client';

import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';
import { useCampaignStore } from '@/lib/campaigns/orchestrator';

const USAGE_DAYS_KEY = 'rate-app:usage-days';
const PROMPTS_KEY = 'rate-app:prompts';

const MIN_USAGE_DAYS = 3;
const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const PROMPT_DELAY_MS = 1200;

const PLATFORM_POLICY = {
  ios: { cooldownMs: 122 * DAY_MS, maxPerYear: 3 },
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
  const { active, pending, busyReasons } = useCampaignStore.getState();
  return !!active || !!pending || busyReasons.length > 0;
}

export function recordAppUsageDay() {
  if (typeof window === 'undefined') return;
  const today = localDayKey();
  const days = readJson<string[]>(USAGE_DAYS_KEY, []);
  if (days.includes(today)) return;
  writeJson(USAGE_DAYS_KEY, [...days, today].slice(-30));
}

export function maybeRequestAppRating() {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;
  if (requestInFlight) return;

  const usageDays = readJson<string[]>(USAGE_DAYS_KEY, []);
  if (usageDays.length < MIN_USAGE_DAYS) return;

  const { cooldownMs, maxPerYear } = policy();
  const now = Date.now();
  const prompts = recentPrompts(now);
  if (prompts.length >= maxPerYear) return;
  if (prompts.some((ts) => now - ts < cooldownMs)) return;
  if (interrupted()) return;

  requestInFlight = true;
  window.setTimeout(async () => {
    try {
      if (interrupted()) return;
      await InAppReview.requestReview();
      const at = Date.now();
      writeJson(PROMPTS_KEY, [...recentPrompts(at), at]);
    } catch {
    } finally {
      requestInFlight = false;
    }
  }, PROMPT_DELAY_MS);
}
