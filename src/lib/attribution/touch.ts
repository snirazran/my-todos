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

export function applyMetaLinkToFirstTouch(url: string): 'tagged' | 'untagged' | 'failed' {
  if (typeof window === 'undefined') return 'failed';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(query);
  const found: Partial<FirstTouch> = {};
  for (const key of PARAMS) {
    const value = params.get(key)?.trim();
    if (value) found[key] = value.slice(0, 200);
  }
  try {
    const touch: FirstTouch = {
      ...(readFirstTouch() ?? { at: new Date().toISOString() }),
      utm_source: 'meta',
      utm_medium: 'paid_social',
      ...found,
    };
    window.localStorage.setItem(TOUCH_KEY, JSON.stringify(touch));
    return found.utm_campaign ? 'tagged' : 'untagged';
  } catch {
    return 'failed';
  }
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
