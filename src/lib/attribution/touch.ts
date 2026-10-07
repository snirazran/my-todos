'use client';

import type { FirstTouch } from './classify';

const TOUCH_KEY = 'frogress.attribution.firstTouch';
const PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'ttclid',
  'gclid',
  'ref',
  'friend',
] as const;

export function captureFirstTouch() {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(TOUCH_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const touch: FirstTouch = {
      at: new Date().toISOString(),
      landing: window.location.pathname.slice(0, 300),
    };
    if (document.referrer) touch.referrer = document.referrer.slice(0, 300);
    for (const key of PARAMS) {
      const value = params.get(key)?.trim();
      if (value) touch[key] = value.slice(0, 200);
    }
    window.localStorage.setItem(TOUCH_KEY, JSON.stringify(touch));
  } catch {}
}

export function readFirstTouch(): FirstTouch | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(TOUCH_KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : undefined;
  } catch {
    return undefined;
  }
}
