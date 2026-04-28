export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getAdminMessaging } from '@/lib/firebaseAdmin';

type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';
type TimerNotificationType =
  | 'timer_complete'
  | 'break_started'
  | 'break_complete';

function getTimerNotification(
  phase: TimerPhase,
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

/**
 * POST /api/notifications/timer
 * Body: { phase: 'focus' | 'shortBreak' | 'longBreak', autoStartBreak?: boolean }
 *
 * Sends a push notification to all registered phone devices when a Frogodoro
 * phase finishes, including auto-started breaks and completed breaks.
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { phase, autoStartBreak = false } = await req.json();
  const notification = getTimerNotification(
    phase as TimerPhase,
    Boolean(autoStartBreak),
  );

  if (!notification) {
    return NextResponse.json({ error: 'Invalid timer phase' }, { status: 400 });
  }

  await connectMongo();

  const user = await UserModel.findById(uid)
    .select('notificationPrefs')
    .lean()
    .exec();

  const prefs = (user as any)?.notificationPrefs;
  const tokens: string[] = prefs?.enabled ? prefs?.fcmTokens ?? [] : [];

  if (!tokens.length) {
    return NextResponse.json({ ok: true, sent: 0 });
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
      { _id: uid },
      { $pull: { 'notificationPrefs.fcmTokens': { $in: invalidTokens } } },
    );
  }

  return NextResponse.json({
    ok: true,
    sent,
    type: notification.type,
  });
}
