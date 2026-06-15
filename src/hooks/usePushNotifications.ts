'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Hook that handles push notification setup for native platforms (Android/iOS).
 * - Requests permission
 * - Registers the FCM token with the server
 * - Tracks user activity for smart notification timing
 *
 * Uses @capacitor-firebase/messaging so both iOS and Android return a real FCM
 * registration token (the bare @capacitor/push-notifications plugin returns a
 * raw APNs token on iOS, which Firebase cannot send to).
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

    async function registerToken(token: string) {
      if (!token) return;
      try {
        await fetch('/api/notifications/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fcmToken: token, timezone: tz }),
        });
      } catch (err) {
        console.error('Failed to register FCM token:', err);
      }
    }

    async function setup() {
      try {
        // Check current permission status
        let permStatus = await FirebaseMessaging.checkPermissions();

        if (
          permStatus.receive === 'prompt' ||
          permStatus.receive === 'prompt-with-rationale'
        ) {
          permStatus = await FirebaseMessaging.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Keep the server in sync if Firebase rotates the token.
        await FirebaseMessaging.addListener('tokenReceived', (event) => {
          console.log('FCM token received:', event.token);
          void registerToken(event.token);
        });

        // Fetch the current token (registers with APNs/FCM under the hood).
        const { token } = await FirebaseMessaging.getToken();
        await registerToken(token);

        // Handle messages received while the app is in the foreground.
        await FirebaseMessaging.addListener(
          'notificationReceived',
          async (event) => {
            const notification = event.notification;
            console.log('Push notification received:', notification);
            const type = (notification.data as Record<string, unknown> | undefined)
              ?.type;
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
        await FirebaseMessaging.addListener(
          'notificationActionPerformed',
          (event) => {
            const path = (
              event.notification.data as Record<string, unknown> | undefined
            )?.path;
            if (typeof path === 'string' && path) {
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
      void FirebaseMessaging.removeAllListeners();
    };
  }, [userId, router]);
}
