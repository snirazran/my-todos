'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/components/auth/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initWebPush } from '@/lib/webPush';

/**
 * Invisible component that initializes push notifications.
 * Native platforms register via usePushNotifications; web (re)binds the
 * already-granted web-push token + foreground listener on load.
 */
export function PushNotificationInit() {
  const { user } = useAuth();
  usePushNotifications(user?.uid);

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
