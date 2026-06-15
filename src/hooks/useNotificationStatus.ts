'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

function normalizePermission(value: string): PushPermission {
  if (value === 'granted' || value === 'denied') return value;
  if (value === 'prompt' || value === 'prompt-with-rationale') return 'prompt';
  return 'unknown';
}

export function useNotificationStatus() {
  const isNative =
    typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [permission, setPermission] = useState<PushPermission>('unknown');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      const status = await FirebaseMessaging.checkPermissions();
      setPermission(normalizePermission(status.receive));
    } catch {
      setPermission('unknown');
    }
  }, [isNative]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestEnable = useCallback(async () => {
    if (!isNative) return permission;
    setLoading(true);
    try {
      const status = await FirebaseMessaging.requestPermissions();
      const next = normalizePermission(status.receive);
      setPermission(next);
      if (next === 'granted') {
        try {
          // Mint the FCM token and register it with the server.
          const { token } = await FirebaseMessaging.getToken();
          if (token) {
            const timezone =
              Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ fcmToken: token, timezone }),
            });
          }
        } catch {
          /* ignore */
        }
      }
      return next;
    } finally {
      setLoading(false);
    }
  }, [isNative, permission]);

  return {
    isNative,
    permission,
    isEnabled: permission === 'granted',
    canEnable: isNative && permission !== 'granted',
    loading,
    refresh,
    requestEnable,
  };
}
