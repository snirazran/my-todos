import { getAdminMessaging } from '@/lib/firebaseAdmin';
import UserModel from '@/lib/models/User';

function isInvalidTokenError(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

/**
 * Wardrobe push. `path` deep-links straight at the item so the notification is
 * one tap from the purchase sheet rather than dropping the player in a shop
 * they then have to search.
 */
export async function sendWardrobePush(
  userId: string,
  opts: { title: string; body: string; type: string; path: string },
) {
  try {
    const user = await UserModel.findById(userId, {
      'notificationPrefs.fcmTokens': 1,
      'notificationPrefs.enabled': 1,
    }).lean<{
      notificationPrefs?: { fcmTokens?: string[]; enabled?: boolean };
    }>();
    if (user?.notificationPrefs?.enabled === false) return false;
    const tokens = user?.notificationPrefs?.fcmTokens ?? [];
    if (tokens.length === 0) return false;

    const messaging = getAdminMessaging();
    const invalid: string[] = [];
    let delivered = 0;
    await Promise.all(
      tokens.map(async (token) => {
        try {
          await messaging.send({
            token,
            notification: { title: opts.title, body: opts.body },
            data: { type: opts.type, path: opts.path },
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
    return delivered > 0;
  } catch (err) {
    console.error(
      'Wardrobe push failed:',
      (err as { message?: string } | null)?.message,
    );
    return false;
  }
}
