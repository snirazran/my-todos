// src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import FriendshipModel from '@/lib/models/Friendship';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import { contributionFrom } from '@/lib/friends/indices';
import { MAX_HUNGER_MS } from '@/lib/hungerLogic';
import type {
  FriendFlyDaily,
  NotificationPrefs,
  UserWardrobe,
} from '@/lib/types/UserDoc';
import {
  eveningMessage,
  farewellMessage,
  friendFliesMessage,
  hungerMessage,
  morningMessage,
} from '@/lib/notifications/frogVoice';

const CRON_SECRET = process.env.CRON_SECRET;

// Minimum hours between notifications to the same user
const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;

// Consecutive routine nudges ignored (no app open in between) before muting them
const REMINDER_MUTE_THRESHOLD = 5;

type PushMessage = {
  title: string;
  body: string;
  data: Record<string, string>;
};

/**
 * Get the current hour (0-23) in a given IANA timezone.
 */
function getCurrentHourInTz(tz: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    return parseInt(formatted, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

/**
 * Get today's date string (YYYY-MM-DD) in a given timezone.
 */
function getTodayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Count uncompleted tasks for a user on a given date, and pick one concrete
 * task to name in the nudge: the next scheduled one, else the shortest-titled
 * (a stand-in for "smallest").
 */
async function getUncompletedTasks(
  userId: string,
  dateYMD: string,
): Promise<{ count: number; exampleText: string | null }> {
  const dow = new Date(`${dateYMD}T12:00:00Z`).getUTCDay();

  const tasks = await TaskModel.find({
    userId,
    deletedAt: { $exists: false },
    $or: [
      { type: 'weekly', dayOfWeek: dow as any },
      { type: 'regular', date: dateYMD },
    ],
  })
    .lean()
    .exec();

  // Filter out suppressed and already completed
  const uncompleted = tasks.filter((t: any) => {
    if ((t.suppressedDates ?? []).includes(dateYMD)) return false;
    if (t.type === 'weekly') {
      return !(t.completedDates ?? []).includes(dateYMD);
    }
    return !t.completed;
  });

  const scheduled = uncompleted
    .filter((t: any) => typeof t.startTime === 'string' && t.startTime)
    .sort((a: any, b: any) => String(a.startTime).localeCompare(String(b.startTime)));
  const example =
    scheduled[0] ??
    [...uncompleted].sort(
      (a: any, b: any) =>
        String(a.text ?? '').length - String(b.text ?? '').length,
    )[0];

  return {
    count: uncompleted.length,
    exampleText: (example as any)?.text ?? null,
  };
}

/**
 * True when the frog's hunger has run out and the next fly penalty is
 * less than 24h away — the last useful moment to warn.
 */
function isFrogStarving(wardrobe: Partial<UserWardrobe> | undefined): boolean {
  const flies = wardrobe?.flies ?? 0;
  if (flies <= 0) return false;

  const hunger =
    typeof wardrobe?.hunger === 'number' && !isNaN(wardrobe.hunger)
      ? Math.min(wardrobe.hunger, MAX_HUNGER_MS)
      : MAX_HUNGER_MS;

  let lastUpdate = Date.now();
  if (wardrobe?.lastHungerUpdate) {
    const t = new Date(wardrobe.lastHungerUpdate).getTime();
    if (!isNaN(t)) lastUpdate = t;
  }

  const remaining = hunger - (Date.now() - lastUpdate);
  return remaining <= 0;
}

/**
 * Flies earned by friends today that the user hasn't claimed yet.
 * These expire at the user's local midnight.
 */
async function countUnclaimedFriendFlies(
  userId: string,
  friendFlyDaily: FriendFlyDaily | undefined,
  todayYMD: string,
): Promise<number> {
  const edges = await FriendshipModel.find({
    $or: [{ userA: userId }, { userB: userId }],
  })
    .lean()
    .exec();
  const friendIds = edges.map((e: any) =>
    e.userA === userId ? e.userB : e.userA,
  );
  if (friendIds.length === 0) return 0;

  const friends = await UserModel.find({ _id: { $in: friendIds } })
    .select('wardrobe.flyDaily')
    .lean()
    .exec();

  const credited: Record<string, number> =
    friendFlyDaily && friendFlyDaily.date === todayYMD
      ? friendFlyDaily.credited ?? {}
      : {};

  let owed = 0;
  for (const f of friends as any[]) {
    const earned =
      f.wardrobe?.flyDaily?.date === todayYMD
        ? f.wardrobe.flyDaily.earned ?? 0
        : 0;
    const total = contributionFrom(earned);
    owed += Math.max(0, total - (credited[f._id] ?? 0));
  }
  return owed;
}

/**
 * GET /api/cron/send-reminders
 *
 * Called by an external cron service every 30 minutes.
 * For each user with notifications enabled, checks if the current hour
 * matches their morning or evening slot and sends at most one push.
 *
 * Morning slot: plan-your-day nudge (only if open tasks exist).
 * Evening slot: highest-value message wins —
 *   1. frog about to eat a fly (loss)
 *   2. unclaimed friend flies expiring at midnight (loss)
 *   3. open tasks remaining (nudge)
 */
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();

  // Find all users with notifications enabled and at least one FCM token
  const users = await UserModel.find({
    'notificationPrefs.enabled': true,
    'notificationPrefs.fcmTokens': { $exists: true, $ne: [] },
  })
    .select(
      '_id notificationPrefs frogName wardrobe.flies wardrobe.hunger wardrobe.lastHungerUpdate wardrobe.friendFlyDaily',
    )
    .lean()
    .exec();

  const messaging = getAdminMessaging();
  const results: { userId: string; sent: boolean; reason?: string }[] = [];

  for (const user of users) {
    const userId = (user as any)._id as string;
    const prefs = (user as any).notificationPrefs as NotificationPrefs;
    const wardrobe = (user as any).wardrobe as
      | Partial<UserWardrobe>
      | undefined;
    const frog = ((user as any).frogName as string | undefined)?.trim() ||
      'Your frog';

    if (!prefs?.fcmTokens?.length) {
      results.push({ userId, sent: false, reason: 'no_tokens' });
      continue;
    }

    const tz = prefs.timezone || 'UTC';
    const currentHour = getCurrentHourInTz(tz);
    const morningSlot = prefs.morningSlot ?? 9;
    const eveningSlot = prefs.eveningSlot ?? 21;

    const isMorning = currentHour === morningSlot;
    const isEvening = currentHour === eveningSlot;

    if (!isMorning && !isEvening) {
      results.push({ userId, sent: false, reason: 'not_scheduled_hour' });
      continue;
    }

    // Check minimum gap between notifications
    if (prefs.lastNotifiedAt) {
      const hoursSinceLast =
        (Date.now() - new Date(prefs.lastNotifiedAt).getTime()) /
        (1000 * 60 * 60);
      if (hoursSinceLast < MIN_HOURS_BETWEEN_NOTIFICATIONS) {
        results.push({ userId, sent: false, reason: 'too_recent' });
        continue;
      }
    }

    const todayYMD = getTodayInTz(tz);
    const { count: uncompletedCount, exampleText } = await getUncompletedTasks(
      userId,
      todayYMD,
    );
    const ignoredCount = prefs.reminderIgnoredCount ?? 0;

    const routineNudge = (slot: 'morning' | 'evening'): PushMessage | null => {
      if (uncompletedCount === 0) return null;
      if (ignoredCount < REMINDER_MUTE_THRESHOLD) {
        const ctx = { count: uncompletedCount, frog, exampleTask: exampleText };
        const copy =
          slot === 'morning' ? morningMessage(ctx) : eveningMessage(ctx);
        return {
          ...copy,
          data: {
            type: 'task_reminder',
            uncompletedCount: String(uncompletedCount),
          },
        };
      }
      if (ignoredCount === REMINDER_MUTE_THRESHOLD) {
        return {
          ...farewellMessage(frog),
          data: { type: 'task_reminder_muted', path: '/' },
        };
      }
      return null;
    };

    let message: PushMessage | null = null;
    let isRoutine = false;

    if (isEvening) {
      if (isFrogStarving(wardrobe)) {
        message = { ...hungerMessage(frog), data: { type: 'frog_hunger', path: '/' } };
      } else {
        const owedFlies = await countUnclaimedFriendFlies(
          userId,
          wardrobe?.friendFlyDaily,
          todayYMD,
        );
        if (owedFlies > 0) {
          message = {
            ...friendFliesMessage(owedFlies),
            data: { type: 'friend_flies', path: '/friends' },
          };
        } else {
          message = routineNudge('evening');
          isRoutine = message !== null;
        }
      }
    } else {
      message = routineNudge('morning');
      isRoutine = message !== null;
    }

    if (!message) {
      results.push({
        userId,
        sent: false,
        reason:
          ignoredCount > REMINDER_MUTE_THRESHOLD && uncompletedCount > 0
            ? 'reminders_muted'
            : 'nothing_to_say',
      });
      continue;
    }

    // Send to all registered tokens
    const invalidTokens: string[] = [];

    for (const token of prefs.fcmTokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: message.data,
          // Android-specific config
          android: {
            priority: 'high' as const,
            notification: {
              channelId: 'task_reminders',
              icon: 'ic_notification',
              color: '#4CAF50',
            },
          },
          // iOS-specific config (APNs)
          apns: {
            payload: {
              aps: {
                alert: {
                  title: message.title,
                  body: message.body,
                },
                sound: 'default',
              },
            },
          },
        });
      } catch (err: any) {
        // If token is invalid/expired, mark for cleanup
        if (
          err?.code === 'messaging/registration-token-not-registered' ||
          err?.code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(token);
        }
        console.error(`FCM send failed for user ${userId}:`, err?.message);
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      await UserModel.updateOne(
        { _id: userId },
        { $pull: { 'notificationPrefs.fcmTokens': { $in: invalidTokens } } },
      );
    }

    // Update last notified timestamp; routine nudges also count toward the
    // mute threshold until app activity resets it
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: { 'notificationPrefs.lastNotifiedAt': new Date() },
        ...(isRoutine
          ? { $inc: { 'notificationPrefs.reminderIgnoredCount': 1 } }
          : {}),
      },
    );

    results.push({ userId, sent: true });
  }

  const sentCount = results.filter((r) => r.sent).length;
  return NextResponse.json({
    ok: true,
    processed: results.length,
    sent: sentCount,
    results,
  });
}
