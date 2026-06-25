'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { setLiveActivityControlToken, setTimerControlConfig } from '@/lib/liveTimer';
import {
  notifyTaskSync,
  type TaskSyncDetail,
  type TaskSyncEventKind,
} from '@/lib/taskSyncClient';

function stringDataValue(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function isTaskSyncEventKind(
  value: string | undefined,
): value is TaskSyncEventKind {
  return (
    value === 'tasks-changed' ||
    value === 'task-completed' ||
    value === 'task-uncompleted' ||
    value === 'background-equipped' ||
    value === 'wardrobe-equipped'
  );
}

function taskSyncDetailFromData(
  data: Record<string, unknown>,
): Partial<TaskSyncDetail> {
  const completedValue = stringDataValue(data, 'completed');
  const eventKind = stringDataValue(data, 'eventKind');
  const itemId = stringDataValue(data, 'itemId');
  return {
    eventId: stringDataValue(data, 'eventId'),
    changedAt: stringDataValue(data, 'changedAt'),
    eventKind: isTaskSyncEventKind(eventKind) ? eventKind : undefined,
    taskId: stringDataValue(data, 'taskId'),
    completed:
      completedValue === 'true'
        ? true
        : completedValue === 'false'
          ? false
          : undefined,
    date: stringDataValue(data, 'date'),
    backgroundId: stringDataValue(data, 'backgroundId'),
    slot: stringDataValue(data, 'slot'),
    itemId: itemId === '' ? null : itemId,
  };
}

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
      // Stash it for the Live Activity Done/Pause/Stop intent to authenticate with.
      void setLiveActivityControlToken(token);
      void setTimerControlConfig(token);
      try {
        await fetch('/api/notifications/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
          fcmToken: token,
          timezone: tz,
          platform: Capacitor.getPlatform(),
        }),
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

        await FirebaseMessaging.addListener('notificationReceived', (event) => {
          const data = event.notification.data as
            | Record<string, unknown>
            | undefined;
          if (data?.type !== 'task_sync') return;
          notifyTaskSync({
            reason: 'remote-message',
            ...taskSyncDetailFromData(data),
          });
        });
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
