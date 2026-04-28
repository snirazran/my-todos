import UserModel from '@/lib/models/User';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import type { PomodoroPhase } from '@/lib/frogodoroStore';

type TimerNotificationType =
  | 'timer_complete'
  | 'break_started'
  | 'break_complete';

export function getTimerNotification(
  phase: PomodoroPhase,
  autoStartBreak: boolean,
): { title: string; body: string; type: TimerNotificationType } | null {
  if (phase === 'focus' && autoStartBreak) {
    return {
      type: 'break_started',
      title: 'Break started',
      body: 'Focus time finished. Your break has started.',
    };
  }

  if (phase === 'focus') {
    return {
      type: 'timer_complete',
      title: 'Focus timer finished',
      body: 'Time for a break. You earned it!',
    };
  }

  if (phase === 'shortBreak') {
    return {
      type: 'break_complete',
      title: 'Short break finished',
      body: 'Ready to focus? Start your next session.',
    };
  }

  if (phase === 'longBreak') {
    return {
      type: 'break_complete',
      title: 'Long break finished',
      body: 'Feeling refreshed? Time to get back to it.',
    };
  }

  return null;
}

export async function sendTimerPushToUser({
  userId,
  phase,
  autoStartBreak,
  tokens,
}: {
  userId: string;
  phase: PomodoroPhase;
  autoStartBreak: boolean;
  tokens: string[];
}) {
  const notification = getTimerNotification(phase, autoStartBreak);
  if (!notification || tokens.length === 0) {
    return { sent: 0, type: notification?.type ?? null };
  }

  const messaging = getAdminMessaging();
  const invalidTokens: string[] = [];
  let sent = 0;

  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          type: notification.type,
          phase,
          path: '/timer',
        },
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'timer_alerts',
            icon: 'ic_notification',
            color: '#4CAF50',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              sound: 'default',
            },
          },
        },
      });
      sent++;
    } catch (err: any) {
      if (
        err?.code === 'messaging/registration-token-not-registered' ||
        err?.code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(token);
      }
      console.error('FCM timer notification failed:', err?.message);
    }
  }

  if (invalidTokens.length > 0) {
    await UserModel.updateOne(
      { _id: userId },
      { $pull: { 'notificationPrefs.fcmTokens': { $in: invalidTokens } } },
    );
  }

  return { sent, type: notification.type };
}
