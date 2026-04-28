'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * dd
 * Hook that handles push notification setup for native platforms (Android/iOS).
 * - Requests permission
 * - Registers the FCM token with the server
 * - Tracks user activity for smart notification timing
 *
 * On web, this hook is a no-op (push notifications use a different mechanism).
 */
export function usePushNotifications(userId: string | null | undefined) {
  const router = useRouter();
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
              credentials: 'include',
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
          async (notification) => {
            console.log('Push notification received:', notification);
            const type = notification.data?.type;
            const shouldDisplayForegroundTimerNotification =
              type === 'timer_complete' ||
              type === 'break_started' ||
              type === 'break_complete';

            if (!shouldDisplayForegroundTimerNotification) return;

            try {
              const perms = await LocalNotifications.checkPermissions();
              if (perms.display !== 'granted') {
                const requested = await LocalNotifications.requestPermissions();
                if (requested.display !== 'granted') return;
              }

              await LocalNotifications.schedule({
                notifications: [
                  {
                    id: Date.now() % 2147483647,
                    title: notification.title ?? 'Frogodoro timer',
                    body: notification.body ?? 'Your timer status changed.',
                    schedule: { at: new Date(Date.now() + 100) },
                    sound: 'default',
                    smallIcon: 'ic_notification',
                    iconColor: '#4CAF50',
                    extra: notification.data,
                  },
                ],
              });
            } catch (err) {
              console.error('Failed to show foreground timer notification:', err);
            }
          },
        );

        // Handle notification tap (app opened from notification)
        PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const path = action.notification.data?.path;
            if (path) {
              router.push(path);
            }
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
          credentials: 'include',
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
  }, [userId, router]);
}
