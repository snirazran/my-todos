import { getAdminMessaging } from '@/lib/firebaseAdmin';
import UserModel from '@/lib/models/User';
import FriendshipModel from '@/lib/models/Friendship';
import connectMongo from '@/lib/mongoose';
import {
  createTaskEvent,
  type TaskSyncChange,
  type TaskEventMessage,
} from '@/lib/taskEvents';

const FRIEND_RELEVANT_KINDS = new Set<TaskSyncChange['eventKind']>([
  'task-completed',
  'task-uncompleted',
  'wardrobe-equipped',
]);

export type { TaskSyncChange } from '@/lib/taskEvents';

function isInvalidTokenError(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

export async function sendTaskSyncMessage(
  userId: string,
  event?: TaskEventMessage,
) {
  try {
    const user = await UserModel.findById(userId, {
      'notificationPrefs.androidFcmTokens': 1,
      'notificationPrefs.iosFcmTokens': 1,
    }).lean<{
      notificationPrefs?: {
        androidFcmTokens?: string[];
        iosFcmTokens?: string[];
      };
    }>();
    const tokens = Array.from(
      new Set(
        [
          ...(user?.notificationPrefs?.androidFcmTokens ?? []),
          ...(user?.notificationPrefs?.iosFcmTokens ?? []),
        ].filter(Boolean),
      ),
    );
    if (tokens.length === 0) return;

    const messaging = getAdminMessaging();
    const invalidTokens: string[] = [];
    const data: Record<string, string> = {
      type: 'task_sync',
      changedAt: event?.changedAt ?? new Date().toISOString(),
    };
    if (event) {
      data.eventId = event.eventId;
      data.eventKind = event.eventKind;
      if (event.taskId) data.taskId = event.taskId;
      if (typeof event.completed === 'boolean') {
        data.completed = String(event.completed);
      }
      if (event.date) data.date = event.date;
      if (event.backgroundId) data.backgroundId = event.backgroundId;
      if (event.slot) data.slot = event.slot;
      if (typeof event.itemId === 'string') data.itemId = event.itemId;
      if (event.itemId === null) data.itemId = '';
    }

    await Promise.all(
      tokens.map(async (token) => {
        try {
          await messaging.send({
            token,
            data,
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

export async function notifyFriendsChanged(actorId: string) {
  try {
    await connectMongo();
    const edges = await FriendshipModel.find({
      $or: [{ userA: actorId }, { userB: actorId }],
    })
      .select('userA userB')
      .lean();
    const friendIds = edges.map((e) =>
      e.userA === actorId ? e.userB : e.userA,
    );
    await Promise.all(
      friendIds.map(async (friendId) => {
        const event = await createTaskEvent(friendId, {
          eventKind: 'friend-updated',
        });
        void sendTaskSyncMessage(friendId, event);
      }),
    );
  } catch (err) {
    console.error(
      'Friend sync fan-out failed:',
      (err as { message?: string } | null)?.message,
    );
  }
}

export async function notifyFriendUpdate(userId: string) {
  try {
    const event = await createTaskEvent(userId, { eventKind: 'friend-updated' });
    void sendTaskSyncMessage(userId, event);
  } catch (err) {
    console.error(
      'Friend update notify failed:',
      (err as { message?: string } | null)?.message,
    );
  }
}

export async function notifyUserChanged(userId: string, change?: TaskSyncChange) {
  try {
    const event = await createTaskEvent(userId, change);
    void sendTaskSyncMessage(userId, event);
    if (change?.eventKind && FRIEND_RELEVANT_KINDS.has(change.eventKind)) {
      void notifyFriendsChanged(userId);
    }
    return event;
  } catch (err) {
    console.error(
      'Task event publish failed:',
      (err as { message?: string } | null)?.message,
    );
    void sendTaskSyncMessage(userId);
    return null;
  }
}

export function notifyTaskChanged(userId: string, change?: TaskSyncChange) {
  return notifyUserChanged(userId, change);
}
