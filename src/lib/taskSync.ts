import { getAdminMessaging } from '@/lib/firebaseAdmin';
import UserModel from '@/lib/models/User';

function isInvalidTokenError(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

export async function sendTaskSyncMessage(userId: string) {
  try {
    const user = await UserModel.findById(userId, {
      'notificationPrefs.fcmTokens': 1,
    }).lean<{ notificationPrefs?: { fcmTokens?: string[] } }>();
    const tokens = Array.from(
      new Set((user?.notificationPrefs?.fcmTokens ?? []).filter(Boolean)),
    );
    if (tokens.length === 0) return;

    const messaging = getAdminMessaging();
    const invalidTokens: string[] = [];
    const changedAt = new Date().toISOString();

    await Promise.all(
      tokens.map(async (token) => {
        try {
          await messaging.send({
            token,
            data: {
              type: 'task_sync',
              changedAt,
            },
            android: { priority: 'high' as const },
            apns: {
              headers: {
                'apns-priority': '5',
                'apns-push-type': 'background',
              },
              payload: { aps: { 'content-available': 1 } },
            },
          });
        } catch (err) {
          if (isInvalidTokenError(err)) invalidTokens.push(token);
          console.error(
            'FCM task sync failed:',
            (err as { message?: string } | null)?.message,
          );
        }
      }),
    );

    if (invalidTokens.length > 0) {
      await UserModel.updateOne(
        { _id: userId },
        {
          $pull: {
            'notificationPrefs.fcmTokens': { $in: invalidTokens },
            'notificationPrefs.androidFcmTokens': { $in: invalidTokens },
          },
        },
      );
    }
  } catch (err) {
    console.error(
      'Task sync message failed:',
      (err as { message?: string } | null)?.message,
    );
  }
}

export function notifyTaskChanged(userId: string) {
  return sendTaskSyncMessage(userId);
}
