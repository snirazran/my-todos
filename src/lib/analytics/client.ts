'use client';

import type { AnalyticsEventName } from '@/lib/analytics/events';

export function trackAnalyticsEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
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
    body: JSON.stringify({ name, properties, sessionId, anonymousId }),
  }).catch(() => {});
}
