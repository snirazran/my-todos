export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getAdminMessaging } from '@/lib/firebaseAdmin';

/**
 * POST /api/notifications/timer
 * Body: { phase: 'focus' | 'shortBreak' | 'longBreak', autoStartBreak?: boolean }
 *
 * Sends a push notification to all of the user's registered devices
 * when a Frogodoro timer phase completes.
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { phase, autoStartBreak } = await req.json();

  let title: string;
  let body: string;

  if (phase === 'focus') {
    title = '🐸 Session complete!';
    body = autoStartBreak
      ? 'Your break has started. Step away and recharge.'
      : 'Time for a break. You earned it!';
  } else if (phase === 'shortBreak') {
    title = '☕ Break is over!';
    body = 'Ready to focus? Start your next session.';
  } else {
    title = '💤 Long break is over!';
    body = 'Feeling refreshed? Time to get back to it.';
  }

  await connectMongo();

  const user = await UserModel.findById(uid)
    .select('notificationPrefs')
    .lean()
    .exec();

  const tokens: string[] = (user as any)?.notificationPrefs?.fcmTokens ?? [];

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
        notification: { title, body },
        data: { type: 'timer_complete', phase, path: '/timer' },
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
              alert: { title, body },
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

  return NextResponse.json({ ok: true, sent });
}
