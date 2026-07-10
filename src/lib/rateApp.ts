'use client';

import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';

const USAGE_DAYS_KEY = 'rate-app:usage-days';
const PROMPTS_KEY = 'rate-app:prompts';

const MIN_USAGE_DAYS = 3;
const PROMPT_COOLDOWN_MS = 122 * 86_400_000;
const MAX_PROMPTS_PER_YEAR = 3;
const YEAR_MS = 365 * 86_400_000;
const PROMPT_DELAY_MS = 1200;

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

  const usageDays = readJson<string[]>(USAGE_DAYS_KEY, []);
  if (usageDays.length < MIN_USAGE_DAYS) return;

  const now = Date.now();
  const prompts = readJson<number[]>(PROMPTS_KEY, []).filter(
    (ts) => Number.isFinite(ts) && now - ts < YEAR_MS,
  );
  if (prompts.length >= MAX_PROMPTS_PER_YEAR) return;
  if (prompts.some((ts) => now - ts < PROMPT_COOLDOWN_MS)) return;

  writeJson(PROMPTS_KEY, [...prompts, now]);
  window.setTimeout(() => {
    void InAppReview.requestReview().catch(() => {});
  }, PROMPT_DELAY_MS);
}
