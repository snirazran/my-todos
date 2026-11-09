import { getAdminMessaging } from '@/lib/firebaseAdmin';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { PUSH_VOICE_VARIANT, type Mood } from '@/lib/notifications/frogVoice';

function isInvalidTokenError(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

export async function sendStreakPush(
  userId: string,
  opts: {
    title: string;
    body: string;
    type: 'streak_saver' | 'streak_freeze_used';
    slot: 'morning' | 'evening';
    mood: Mood;
  },
) {
  try {
    const user = await UserModel.findById(userId, {
      'notificationPrefs.fcmTokens': 1,
    }).lean<{ notificationPrefs?: { fcmTokens?: string[] } }>();
    const tokens = user?.notificationPrefs?.fcmTokens ?? [];
    if (tokens.length === 0) return;

    const messaging = getAdminMessaging();
    const invalid: string[] = [];
    let delivered = 0;
    await Promise.all(
      tokens.map(async (token) => {
        try {
          await messaging.send({
            token,
            notification: { title: opts.title, body: opts.body },
            data: {
              type: opts.type,
              path: '/',
              slot: opts.slot,
              variant: PUSH_VOICE_VARIANT,
              mood: opts.mood,
            },
            android: {
              priority: 'high' as const,
              notification: {
                channelId: 'task_reminders',
                icon: 'ic_notification',
                color: '#4CAF50',
              },
            },
            apns: {
              payload: {
                aps: {
                  alert: { title: opts.title, body: opts.body },
                  sound: 'default',
                },
              },
            },
          });
          delivered += 1;
        } catch (err) {
          if (isInvalidTokenError(err)) invalid.push(token);
        }
      }),
    );

    if (invalid.length > 0) {
      await UserModel.updateOne(
        { _id: userId },
        { $pull: { 'notificationPrefs.fcmTokens': { $in: invalid } } },
      );
    }
    if (delivered > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'notification_sent',
        properties: {
          notification_type: opts.type,
          slot: opts.slot,
          variant: PUSH_VOICE_VARIANT,
          moment: opts.mood,
        },
      });
    }
  } catch (err) {
    console.error(
      'Streak push failed:',
      (err as { message?: string } | null)?.message,
    );
  }
}
