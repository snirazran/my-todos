'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Hook that handles push notification setup for native platforms (Android/iOS).
 * - Requests permission
 * - Registers the FCM token with the server
 * - Tracks user activity for smart notification timing
 *
 * On web, this hook is a no-op (push notifications use a different mechanism).
 */
export function usePushNotifications(userId: string | null | undefined) {
  const registeredRef = useRef(false);

  useEffect(() => {
    // Only run on native platforms (Android / iOS)
    if (!Capacitor.isNativePlatform()) return;
    if (!userId) return;
    if (registeredRef.current) return;

    registeredRef.current = true;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    async function setup() {
      try {
        // Check current permission status
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Register with the native push notification service
        await PushNotifications.register();

        // Listen for the registration token
        PushNotifications.addListener('registration', async (token) => {
          console.log('Push registration token:', token.value);

          try {
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fcmToken: token.value,
                timezone: tz,
              }),
            });
          } catch (err) {
            console.error('Failed to register FCM token:', err);
          }
        });

        // Handle registration errors
        PushNotifications.addListener('registrationError', (err) => {
          console.error('Push registration error:', err);
        });

        // Handle received notifications while app is in foreground
        PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            console.log('Push notification received:', notification);
            // You could show an in-app toast here if desired
          },
        );

        // Handle notification tap (app opened from notification)
        PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            console.log('Push notification action:', action);
            // Could navigate to task list here
          },
        );
      } catch (err) {
        console.error('Push notification setup failed:', err);
      }
    }

    setup();

    // Track activity for smart timing
    async function trackActivity() {
      try {
        await fetch('/api/notifications/track-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: tz }),
        });
      } catch {
        // Silent fail — activity tracking is non-critical
      }
    }

    trackActivity();

    // Cleanup listeners on unmount
    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [userId]);
}
