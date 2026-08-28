// src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import FriendshipModel from '@/lib/models/Friendship';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import { pondFliesFrom, type PondState } from '@/lib/friends/pond';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
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
import { runWishlistDealAlerts } from '@/lib/skins/wishlistAlerts';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const CRON_SECRET = process.env.CRON_SECRET;

// Minimum hours between notifications to the same user
const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;

// Consecutive routine nudges ignored (no app open in between) before muting them
const REMINDER_MUTE_THRESHOLD = 5;

// A scheduled task may only be named as "start with this" once it is within
// this window of its start time (or already overdue)
const SOON_WINDOW_MINUTES = 120;

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
 * Minutes since local midnight in a given IANA timezone.
 */
function getCurrentMinutesInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Count uncompleted tasks for a user on a given date, and pick one concrete
 * task to name in the nudge. A task scheduled for later in the day is never
 * named — it gets its own reminder at its start time — so the candidates are
 * scheduled tasks that are due now or soon, then unscheduled ones (shortest
 * title as a stand-in for "smallest").
 */
async function getUncompletedTasks(
  userId: string,
  dateYMD: string,
  nowMinutes: number,
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

  const dueSoon = uncompleted
    .map((t: any) => ({ task: t, startMinutes: parseHHMM(t.startTime) }))
    .filter(
      (entry) =>
        entry.startMinutes !== null &&
        entry.startMinutes <= nowMinutes + SOON_WINDOW_MINUTES,
    )
    .sort((a, b) => (a.startMinutes as number) - (b.startMinutes as number));

  const unscheduled = uncompleted
    .filter((t: any) => parseHHMM(t.startTime) === null)
    .sort(
      (a: any, b: any) =>
        String(a.text ?? '').length - String(b.text ?? '').length,
    );

  const example = dueSoon[0]?.task ?? unscheduled[0] ?? null;

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
 * Pond flies a user's friends have generated today and not been claimed yet.
 * Driven by the friends' task counts, the same way the pond itself is.
 */
async function countUnclaimedFriendFlies(
  userId: string,
  friendFlyDaily: PondState | undefined,
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
    .select('statistics.daily')
    .lean()
    .exec();

  const config = await loadFlyEconomyConfig();
  const credited: Record<string, number> =
    friendFlyDaily && friendFlyDaily.date === todayYMD
      ? friendFlyDaily.credited ?? {}
      : {};

  let owed = 0;
  for (const f of friends as any[]) {
    const tasks =
      f.statistics?.daily?.date === todayYMD
        ? f.statistics.daily.dailyTasksCount ?? 0
        : 0;
    const total = pondFliesFrom(tasks, config);
    owed += Math.max(0, total - (credited[f._id] ?? 0));
  }
  return owed;
}

/**
 * The week's pact, when it still needs work. Ranks above generic open tasks:
 * a named commitment with a streak on it is the strongest evening message
 * the app has. Returns null when there is nothing pact-shaped to say.
 */
async function pactMessage(
  userId: string,
  tz: string,
  frog: string,
): Promise<PushMessage | null> {
  try {
    const { getPactView } = await import('@/lib/pact/engine');
    const { dowFromYMD } = await import('@/lib/weekStart');
    const view = await getPactView({ userId, timezone: tz });
    if (!view.enabled || view.needsAreas) return null;
    const isWeekStartDay =
      dowFromYMD(getTodayInTz(tz)) === view.weekStartsOn;

    if (!view.active) {
      // Only nudge on the user's own week-start day. Any other day they can
      // still start one — we just don't interrupt them about it.
      if (!isWeekStartDay) return null;
      return {
        title: 'A fresh week',
        body: `Pick one area to push. ${frog} is ready when you are.`,
        data: { type: 'pact_pick', path: '/' },
      };
    }

    const active = view.active;
    if (active.progress >= active.target) return null;

    const left = Math.max(1, active.target - active.progress);
    const title =
      view.streak.atRisk && view.streak.weeks > 0
        ? `${view.streak.weeks}-week streak on the line`
        : `${active.categoryName} this week`;
    return {
      title,
      body:
        left === 1
          ? `One left: ${active.commitmentText}`
          : `${left} left: ${active.commitmentText}`,
      data: { type: 'pact_reminder', path: '/' },
    };
  } catch {
    return null;
  }
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

  // Wishlist deal alerts ride this cron rather than owning one. They have
  // their own per-day dedupe and local-hour window, so the only coupling
  // needed is skipping anyone alerted this run — see below.
  const dealAlerts = await runWishlistDealAlerts().catch(() => ({
    scanned: 0,
    sent: 0,
    notifiedUserIds: new Set<string>(),
  }));

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

    if (dealAlerts.notifiedUserIds.has(userId)) {
      results.push({ userId, sent: false, reason: 'wishlist_deal_sent' });
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
      getCurrentMinutesInTz(tz),
    );
    const ignoredCount = prefs.reminderIgnoredCount ?? 0;

    const routineNudge = (slot: 'morning' | 'evening'): PushMessage | null => {
      if (uncompletedCount === 0) return null;
      if (ignoredCount < REMINDER_MUTE_THRESHOLD) {
        const ctx = {
          count: uncompletedCount,
          frog,
          exampleTask: exampleText,
          ignoredStreak: ignoredCount,
        };
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
          const pactNudge = await pactMessage(userId, tz, frog);
          if (pactNudge) {
            message = pactNudge;
          } else {
            message = routineNudge('evening');
            isRoutine = message !== null;
          }
        }
      }
    } else {
      // On the first day of the user's own week, the pick nudge takes the
      // morning slot instead of the routine one — a fresh week is the moment
      // the ritual is asking for, and it costs no extra notification.
      const pactNudge = await pactMessage(userId, tz, frog);
      if (pactNudge && pactNudge.data.type === 'pact_pick') {
        message = pactNudge;
      } else {
        message = routineNudge('morning');
        isRoutine = message !== null;
      }
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

    await recordAnalyticsEvent({
      userId,
      name: 'notification_sent',
      properties: {
        notification_type: String(message.data.type ?? 'unknown'),
        slot: isEvening ? 'evening' : 'morning',
      },
    });

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
