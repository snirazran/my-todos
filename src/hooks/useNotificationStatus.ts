'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { openAppNotificationSettings } from '@/lib/openAppNotificationSettings';
import {
  isWebPushSupported,
  webPushPermission,
  enableWebPush,
  disableWebPush,
  getWebPushPref,
} from '@/lib/webPush';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

function normalizePermission(value: string): PushPermission {
  if (value === 'granted' || value === 'denied') return value;
  if (value === 'prompt' || value === 'prompt-with-rationale') return 'prompt';
  return 'unknown';
}

function normalizeWebPermission(
  value: NotificationPermission | 'unsupported',
): PushPermission {
  if (value === 'granted' || value === 'denied') return value;
  if (value === 'default') return 'prompt';
  return 'unknown';
}

export function useNotificationStatus() {
  const isNative =
    typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [permission, setPermission] = useState<PushPermission>('unknown');
  const [webSupported, setWebSupported] = useState(false);
  const [webOff, setWebOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const isWeb = !isNative && webSupported;

  const refresh = useCallback(async () => {
    if (isNative) {
      try {
        const status = await FirebaseMessaging.checkPermissions();
        setPermission(normalizePermission(status.receive));
      } catch {
        setPermission('unknown');
      }
      return;
    }
    const supported = await isWebPushSupported();
    setWebSupported(supported);
    setWebOff(getWebPushPref() === 'off');
    setPermission(
      supported ? normalizeWebPermission(webPushPermission()) : 'unknown',
    );
  }, [isNative]);

  useEffect(() => {
    void refresh();
    if (isNative) {
      let remove: (() => void) | undefined;
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void refresh();
      }).then((handle) => {
        remove = () => void handle.remove();
      });
      return () => remove?.();
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh, isNative]);

  const requestEnable = useCallback(async () => {
    if (!isNative) {
      if (!isWeb) return permission;
      setLoading(true);
      try {
        const next = normalizeWebPermission(await enableWebPush());
        setPermission(next);
        if (next === 'granted') setWebOff(false);
        return next;
      } finally {
        setLoading(false);
      }
    }
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
  }, [isNative, isWeb, permission]);

  const disable = useCallback(async () => {
    if (!isWeb) return;
    setLoading(true);
    try {
      await disableWebPush();
      setWebOff(true);
    } finally {
      setLoading(false);
    }
  }, [isWeb]);

  const openSettings = useCallback(async () => {
    await openAppNotificationSettings();
  }, []);

  /**
   * Single entry point for every "Enable notifications" button. If iOS has
   * never shown the permission prompt we trigger the native dialog; otherwise
   * (already granted or hard-denied) the only way to change the toggle is the
   * OS settings screen, so we deep-link there.
   */
  const enableOrConfigure = useCallback(async () => {
    if (!isNative) {
      if (!isWeb) return permission;
      return requestEnable();
    }
    const status = await FirebaseMessaging.checkPermissions();
    const current = normalizePermission(status.receive);
    if (current === 'prompt') {
      return requestEnable();
    }
    await openSettings();
    return current;
  }, [isNative, isWeb, permission, requestEnable, openSettings]);

  const isEnabled = isWeb
    ? permission === 'granted' && !webOff
    : permission === 'granted';

  return {
    isNative,
    isWeb,
    permission,
    isEnabled,
    canEnable: (isNative || isWeb) && !isEnabled,
    loading,
    refresh,
    requestEnable,
    disable,
    openSettings,
    enableOrConfigure,
  };
}
