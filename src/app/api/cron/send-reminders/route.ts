// src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import {
  dayCandidateFilter,
  isCompletedOnDate,
  occursOnDate,
} from '@/lib/taskOccurrence';
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
  firstName,
  friendFliesMessage,
  hungerMessage,
  leapHoldMessage,
  leapPromotionMessage,
  leapResultMessage,
  PUSH_VOICE_VARIANT,
  type CopyCursors,
  type Speaker,
} from '@/lib/notifications/frogVoice';
import { runWishlistDealAlerts } from '@/lib/skins/wishlistAlerts';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { lineGoal } from '@/lib/leap/targets';
import { runLoginStreakSweep } from '@/lib/streak/sweep';
import { previousDayKey } from '@/lib/quests/streak';

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
  bucket?: string;
  cursor?: number;
  mood?: string;
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
  tz: string,
): Promise<{ count: number; done: number; exampleText: string | null }> {
  const tasks = await TaskModel.find(dayCandidateFilter(userId, dateYMD))
    .lean<TaskDoc[]>()
    .exec();

  const today = tasks.filter((t) => occursOnDate(t, dateYMD, tz));
  const uncompleted = today.filter((t) => !isCompletedOnDate(t, dateYMD));

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
    done: today.length - uncompleted.length,
    exampleText: (example as any)?.text ?? null,
  };
}

/** True when the frog's belly has run empty. */
function isFrogStarving(wardrobe: Partial<UserWardrobe> | undefined): boolean {
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

async function leapMessage(
  userId: string,
  tz: string,
  slot: 'morning' | 'evening',
  speaker: Speaker,
): Promise<PushMessage | null> {
  try {
    const { getLeapView } = await import('@/lib/leap/view');
    const { view } = await getLeapView({ userId, timezone: tz });
    if (!view.enabled || view.week.scheduled === 0) return null;
    const league = (index: number) => view.leagues[index]?.label ?? 'Lily';

    if (slot === 'morning') {
      const result = view.weekResult;
      if (!result) return null;
      if (result.outcome !== 'up' && result.outcome !== 'covered') return null;
      const line = leapResultMessage(speaker, result.outcome, league(result.leagueAfter));
      const message: PushMessage = {
        ...line,
        data: { type: 'leap_day', path: '/quests#leap' },
      };
      const claimed = await UserModel.updateOne(
        { _id: userId, 'quests.leap.resultPushed': { $ne: result.weekKey } },
        { $set: { 'quests.leap.resultPushed': result.weekKey } },
      );
      return claimed.modifiedCount === 1 ? message : null;
    }

    const { week } = view;
    if (week.openToday === 0 || week.leap.reached || !week.leap.available) return null;
    const holdLeft = week.hold.reached
      ? 0
      : Math.max(0, lineGoal(week.hold, week.hops, week.activeDays) - week.hops);
    if (
      view.league > 0 &&
      week.hold.available &&
      holdLeft > 0 &&
      holdLeft <= week.openToday
    ) {
      return {
        ...leapHoldMessage(speaker, league(view.league), holdLeft),
        data: { type: 'leap_reminder', path: '/' },
      };
    }
    const left = Math.max(1, lineGoal(week.leap, week.hops, week.activeDays) - week.hops);
    const next = view.leagues[view.league + 1]?.label;
    if (next && left <= Math.min(2, week.openToday)) {
      return {
        ...leapPromotionMessage(speaker, next, left),
        data: { type: 'leap_reminder', path: '/' },
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/cron/send-reminders
 *
 * Called by an external cron service every 30 minutes.
 * The login-streak sweep runs first, so a streak that ends at midnight always
 * gets the evening slot. Then, for each user with notifications enabled whose
 * morning or evening slot is now, sends at most one push from the frog.
 *
 * Morning slot: news only (Leap result). The sweep sends "a Lily Pad saved
 * your streak" in the same slot.
 * Evening slot: highest-value message wins —
 *   1. a streak ends at midnight (sent by the sweep above)
 *   2. Leap league rescue or promotion within reach
 *   3. unclaimed friend flies expiring at midnight
 *   4. frog's belly is empty (nudge — hunger never costs flies)
 *   5. open tasks remaining, at most every other day
 */
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();

  const streakSweep = await runLoginStreakSweep().catch((err) => {
    console.error('Login streak sweep failed:', err);
    return null;
  });

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
      '_id name notificationPrefs frogName wardrobe.flies wardrobe.hunger wardrobe.lastHungerUpdate wardrobe.friendFlyDaily',
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
    const ignoredCount = prefs.reminderIgnoredCount ?? 0;
    const speaker: Speaker = {
      frog,
      name: firstName((user as any).name),
      cursors: prefs.copyCursor as CopyCursors | undefined,
    };
    const withData = (
      line: { title: string; body: string; bucket: string; cursor: number; mood?: string },
      data: Record<string, string>,
    ): PushMessage => ({
      title: line.title,
      body: line.body,
      bucket: line.bucket,
      cursor: line.cursor,
      mood: line.mood,
      data,
    });

    let message: PushMessage | null = null;
    let isRoutine = false;
    let uncompletedCount = 0;
    let skipReason: string | null = null;

    if (isEvening) {
      const tasksToday = await getUncompletedTasks(
        userId,
        todayYMD,
        getCurrentMinutesInTz(tz),
        tz,
      );
      uncompletedCount = tasksToday.count;
      const taskNudgedYesterday =
        prefs.lastTaskNudgeDay === previousDayKey(todayYMD);

      const leapNudge = await leapMessage(userId, tz, 'evening', speaker);
      const owedFlies = leapNudge
        ? 0
        : await countUnclaimedFriendFlies(
            userId,
            wardrobe?.friendFlyDaily,
            todayYMD,
          );
      if (leapNudge) {
        message = leapNudge;
      } else if (owedFlies > 0) {
        message = withData(friendFliesMessage(speaker, owedFlies), {
          type: 'friend_flies',
          path: '/friends',
        });
      } else if (
        isFrogStarving(wardrobe) &&
        ignoredCount < REMINDER_MUTE_THRESHOLD
      ) {
        message = withData(hungerMessage(speaker, tasksToday.exampleText), {
          type: 'frog_hunger',
          path: '/',
        });
        isRoutine = true;
      } else if (uncompletedCount > 0 && ignoredCount < REMINDER_MUTE_THRESHOLD) {
        if (taskNudgedYesterday) {
          skipReason = 'every_other_day';
        } else {
          message = withData(
            eveningMessage(speaker, {
              count: uncompletedCount,
              done: tasksToday.done,
              exampleTask: tasksToday.exampleText,
              ignoredStreak: ignoredCount,
            }),
            {
              type: 'task_reminder',
              uncompletedCount: String(uncompletedCount),
            },
          );
          isRoutine = true;
        }
      } else if (uncompletedCount > 0 && ignoredCount === REMINDER_MUTE_THRESHOLD) {
        message = withData(farewellMessage(speaker), {
          type: 'task_reminder_muted',
          path: '/',
        });
        isRoutine = true;
      }
    } else {
      message = await leapMessage(userId, tz, 'morning', speaker);
    }

    if (!message) {
      results.push({
        userId,
        sent: false,
        reason:
          skipReason ??
          (ignoredCount > REMINDER_MUTE_THRESHOLD && uncompletedCount > 0
            ? 'reminders_muted'
            : 'nothing_to_say'),
      });
      continue;
    }

    const slot = isEvening ? 'evening' : 'morning';

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
          data: {
            ...message.data,
            slot,
            variant: PUSH_VOICE_VARIANT,
            ...(message.mood ? { mood: message.mood } : {}),
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
        slot,
        variant: PUSH_VOICE_VARIANT,
        moment: message.mood,
      },
    });

    // Update last notified timestamp; routine nudges also count toward the
    // mute threshold until app activity resets it
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          'notificationPrefs.lastNotifiedAt': new Date(),
          ...(message.data.type === 'task_reminder'
            ? { 'notificationPrefs.lastTaskNudgeDay': todayYMD }
            : {}),
          ...(message.bucket
            ? {
                [`notificationPrefs.copyCursor.${message.bucket}`]:
                  message.cursor,
              }
            : {}),
        },
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
    streakSweep,
    results,
  });
}
