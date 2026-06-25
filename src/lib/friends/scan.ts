import { Capacitor } from '@capacitor/core';

export function isNativeScan(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Pull a friend code out of a scanned value, whether it's a raw code or a
 * share link like `https://frogress.com/?friend=CODE`.
 */
export function parseFriendValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const code = url.searchParams.get('friend');
    if (code) return code.trim().toUpperCase();
  } catch {
    // Not a URL — fall through and treat it as a raw code.
  }

  if (/^[A-Z0-9]{4,16}$/i.test(value)) return value.toUpperCase();
  return null;
}
