'use client';

export type AdConsent = 'granted' | 'denied';

const STORAGE_KEY = 'frogress.adpixels.consent';

const CONSENT_REGION_ZONES = new Set([
  'Atlantic/Azores',
  'Atlantic/Canary',
  'Atlantic/Madeira',
  'Atlantic/Reykjavik',
  'Asia/Nicosia',
  'Asia/Famagusta',
]);

const listeners = new Set<() => void>();

export function subscribeAdConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function needsAdConsent(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return true;
    return zone.startsWith('Europe/') || CONSENT_REGION_ZONES.has(zone);
  } catch {
    return true;
  }
}

export function readAdConsent(): AdConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function setAdConsent(value: AdConsent) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {}
  listeners.forEach((listener) => listener());
}

export function adPixelsConsented(): boolean {
  if (!needsAdConsent()) return true;
  return readAdConsent() === 'granted';
}
