'use client';

const TTCLID_KEY = 'frogress.adpixels.ttclid';

export function captureClickIds() {
  if (typeof window === 'undefined') return;
  try {
    const ttclid = new URLSearchParams(window.location.search).get('ttclid');
    if (ttclid) window.localStorage.setItem(TTCLID_KEY, ttclid.slice(0, 200));
  } catch {}
}

export function readTtclid(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(TTCLID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
