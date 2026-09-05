'use client';

import type { AnalyticsEventName } from '@/lib/analytics/events';
import { trackAdPixels } from '@/lib/adpixels/client';
import { readTtclid } from '@/lib/adpixels/clickIds';
import { readAdConsent } from '@/lib/adpixels/consent';

export function trackAnalyticsEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  trackAdPixels(name, properties, crypto.randomUUID());

  let sessionId: string | undefined;
  let anonymousId: string | undefined;
  try {
    sessionId = window.sessionStorage.getItem('frogress.analytics.session') ?? undefined;
    anonymousId = window.localStorage.getItem('frogress.analytics.anonymous') ?? undefined;
    if (!anonymousId) {
      anonymousId = crypto.randomUUID();
      window.localStorage.setItem('frogress.analytics.anonymous', anonymousId);
    }
  } catch {}

  const platform = (
    window as typeof window & {
      Capacitor?: { getPlatform?: () => string };
    }
  ).Capacitor?.getPlatform?.();

  void fetch('/api/analytics', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(platform === 'ios' || platform === 'android' ? { 'x-frogress-platform': platform } : {}),
    },
    body: JSON.stringify({
      name,
      properties,
      sessionId,
      anonymousId,
      ttclid: readTtclid(),
      adConsent: readAdConsent(),
    }),
  }).catch(() => {});
}
