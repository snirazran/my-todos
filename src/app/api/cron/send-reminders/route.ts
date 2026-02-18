// src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import type { NotificationPrefs } from '@/lib/types/UserDoc';

const CRON_SECRET = process.env.CRON_SECRET;

// Minimum hours between notifications to the same user
const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;

// Frog-themed notification messages
const NOTIFICATION_MESSAGES = [
  (count: number) =>
    `🐸 You have ${count} task${count === 1 ? '' : 's'} left today! Hop to it!`,
  (count: number) =>
    `🐸 ${count} task${count === 1 ? '' : 's'} waiting for you! Your frog believes in you!`,
  (count: number) =>
    `🐸 Ribbit! ${count} task${count === 1 ? ' is' : 's are'} still on your lily pad!`,
  (count: number) =>
    `🐸 Don't forget! ${count} task${count === 1 ? '' : 's'} to go today!`,
  (count: number) =>
    `🐸 Your frog is watching... ${count} task${count === 1 ? '' : 's'} left!`,
];

function getRandomMessage(count: number): string {
  const idx = Math.floor(Math.random() * NOTIFICATION_MESSAGES.length);
  return NOTIFICATION_MESSAGES[idx](count);
}

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
 * Count uncompleted tasks for a user on a given date.
 */
async function countUncompletedTasks(
  userId: string,
  dateYMD: string,
): Promise<number> {
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

  return uncompleted.length;
}

/**
 * GET /api/cron/send-reminders
 *
 * Called by Vercel Cron (or external cron service) every 30 minutes.
 * For each user with notifications enabled, checks if the current hour
 * matches their morning or evening slot, and sends a push notification
 * about remaining tasks.
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
    .select('_id notificationPrefs')
    .lean()
    .exec();

  const messaging = getAdminMessaging();
  const results: { userId: string; sent: boolean; reason?: string }[] = [];

  for (const user of users) {
    const userId = (user as any)._id as string;
    const prefs = (user as any).notificationPrefs as NotificationPrefs;

    if (!prefs?.fcmTokens?.length) {
      results.push({ userId, sent: false, reason: 'no_tokens' });
      continue;
    }

    const tz = prefs.timezone || 'UTC';
    const currentHour = getCurrentHourInTz(tz);
    const morningSlot = prefs.morningSlot ?? 9;
    const eveningSlot = prefs.eveningSlot ?? 18;

    // Check if current hour matches either slot
    const isSlotMatch =
      currentHour === morningSlot || currentHour === eveningSlot;

    if (!isSlotMatch) {
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

    // Count uncompleted tasks
    const todayYMD = getTodayInTz(tz);
    const uncompletedCount = await countUncompletedTasks(userId, todayYMD);

    if (uncompletedCount === 0) {
      results.push({ userId, sent: false, reason: 'no_tasks' });
      continue;
    }

    const messageBody = getRandomMessage(uncompletedCount);

    // Send to all registered tokens
    const invalidTokens: string[] = [];

    for (const token of prefs.fcmTokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title: 'FrogTask 🐸',
            body: messageBody,
          },
          data: {
            type: 'task_reminder',
            uncompletedCount: String(uncompletedCount),
          },
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
                  title: 'FrogTask 🐸',
                  body: messageBody,
                },
                badge: uncompletedCount,
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

    // Update last notified timestamp
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'notificationPrefs.lastNotifiedAt': new Date() } },
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
