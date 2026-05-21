'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export function useNotificationStatus() {
  const isNative =
    typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [permission, setPermission] = useState<PushPermission>('unknown');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      const status = await PushNotifications.checkPermissions();
      const value = status.receive;
      setPermission(
        value === 'granted' || value === 'denied' || value === 'prompt'
          ? value
          : 'unknown',
      );
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
      const status = await PushNotifications.requestPermissions();
      const next: PushPermission =
        status.receive === 'granted' || status.receive === 'denied' || status.receive === 'prompt'
          ? status.receive
          : 'unknown';
      setPermission(next);
      if (next === 'granted') {
        try {
          await PushNotifications.register();
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
