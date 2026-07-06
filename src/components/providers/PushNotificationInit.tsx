'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/components/auth/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initWebPush } from '@/lib/webPush';

const ACTIVITY_PING_KEY = 'notif_activity_ping_at';
const ACTIVITY_PING_INTERVAL_MS = 45 * 60 * 1000;

function pingActivity() {
  try {
    const last = Number(localStorage.getItem(ACTIVITY_PING_KEY) ?? 0);
    if (Date.now() - last < ACTIVITY_PING_INTERVAL_MS) return;
    localStorage.setItem(ACTIVITY_PING_KEY, String(Date.now()));
    void fetch('/api/notifications/track-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).catch(() => {});
  } catch {
    /* storage unavailable — skip */
  }
}

/**
 * Invisible component that initializes push notifications.
 * Native platforms register via usePushNotifications; web (re)binds the
 * already-granted web-push token + foreground listener on load.
 * Also pings activity tracking (throttled) so notification slots tune
 * to the user's real habit window and ignored-reminder muting resets.
 */
export function PushNotificationInit() {
  const { user } = useAuth();
  usePushNotifications(user?.uid);

  useEffect(() => {
    if (!user?.uid) return;
    pingActivity();
    const onVisible = () => {
      if (document.visibilityState === 'visible') pingActivity();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (Capacitor.isNativePlatform()) return;
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 3000);
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback
        : window.clearTimeout;
    const id = idle(() => void initWebPush());
    return () => cancelIdle(id);
  }, [user?.uid]);

  return null;
}
