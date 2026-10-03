import { APP_STORE_ID } from '@/lib/seo';

export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_URL || 'https://frogress.com';

export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ||
  `https://apps.apple.com/app/id${APP_STORE_ID}`;

export const APP_STORE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;

export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || '';

export type MobileOS = 'ios' | 'android' | null;

export function detectMobileOS(userAgent?: string): MobileOS {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return null;
}

export function storeUrlForDevice(userAgent?: string): string | null {
  const os = detectMobileOS(userAgent);
  if (os === 'ios') return APP_STORE_URL;
  if (os === 'android') return PLAY_STORE_URL || `${WEB_APP_URL}/welcome`;
  return null;
}
