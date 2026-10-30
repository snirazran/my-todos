'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { normalizeAnalyticsPage } from '@/lib/analytics/events';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { captureClickIds } from '@/lib/adpixels/clickIds';
import { activateMetaApp } from '@/lib/adpixels/metaApp';
import { captureFirstTouch } from '@/lib/attribution/touch';

const SESSION_KEY = 'frogress.analytics.session';
const SESSION_LAST_SEEN_KEY = 'frogress.analytics.lastSeen';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function ensureSession() {
  try {
    const now = Date.now();
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    const lastSeen = Number(window.sessionStorage.getItem(SESSION_LAST_SEEN_KEY) ?? 0);
    if (existing && now - lastSeen < SESSION_TIMEOUT_MS) {
      window.sessionStorage.setItem(SESSION_LAST_SEEN_KEY, String(now));
      return { id: existing, isNew: false };
    }
    const value = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, value);
    window.sessionStorage.setItem(SESSION_LAST_SEEN_KEY, String(now));
    return { id: value, isNew: true };
  } catch {
    return undefined;
  }
}

function trackOpen() {
  const session = ensureSession();
  if (!session?.isNew) return;
  let referrerHost = '';
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname : '';
  } catch {}
  const params = new URLSearchParams(window.location.search);
  trackAnalyticsEvent('app_opened', {
    referrer_host: referrerHost,
    utm_source: params.get('utm_source') ?? '',
    utm_medium: params.get('utm_medium') ?? '',
    utm_campaign: params.get('utm_campaign') ?? '',
    utm_content: params.get('utm_content') ?? '',
    utm_term: params.get('utm_term') ?? '',
  });
}

export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    captureClickIds();
    captureFirstTouch();
    if (document.visibilityState === 'visible') {
      trackOpen();
      activateMetaApp();
    }
    const keepAlive = window.setInterval(() => {
      if (document.visibilityState === 'visible') ensureSession();
    }, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      trackOpen();
      activateMetaApp();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const page = normalizeAnalyticsPage(pathname);
    const trackView = () => {
      ensureSession();
      trackAnalyticsEvent('page_viewed', { page });
    };
    if (document.visibilityState === 'visible') {
      trackView();
      return;
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      trackView();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  return null;
}
