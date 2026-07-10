export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import { getZonedToday } from '@/lib/utils';
import { taskReminderBody } from '@/lib/notifications/frogVoice';
import type { NotificationPrefs } from '@/lib/types/UserDoc';

const CRON_SECRET = process.env.CRON_SECRET;
const LOOKBACK_MS = 10 * 60 * 1000;

const REMINDER_OFFSETS: Record<string, number> = {
  at_time: 0,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

function getCurrentHourInTz(tz: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
    );
  } catch {
    return new Date().getUTCHours();
  }
}

function getTimeZoneOffsetMs(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value;
  const match = value?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function zonedWallTimeToUtc(dateYMD: string, hhmm: string, tz: string) {
  const [year, month, day] = dateYMD.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const wallTimeMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(wallTimeMs);
  const firstOffset = getTimeZoneOffsetMs(firstGuess, tz);
  const secondGuess = new Date(wallTimeMs - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(secondGuess, tz);
  return new Date(wallTimeMs - secondOffset);
}

function getTaskReminderDate(task: TaskDoc, todayYMD: string) {
  if (task.type === 'regular') {
    return task.date === todayYMD ? todayYMD : null;
  }

  if (task.type === 'weekly') {
    const dow = new Date(`${todayYMD}T12:00:00Z`).getUTCDay();
    return task.dayOfWeek === dow ? todayYMD : null;
  }

  return null;
}

function isTaskDoneForDate(task: TaskDoc, dateYMD: string) {
  if ((task.suppressedDates ?? []).includes(dateYMD)) return true;
  if ((task.completedDates ?? []).includes(dateYMD)) return true;
  return task.type === 'regular' && !!task.completed;
}

async function sendTaskReminder({
  userId,
  tokens,
  task,
  reminder,
}: {
  userId: string;
  tokens: string[];
  task: TaskDoc;
  reminder: string;
}) {
  if (!tokens.length) return 0;

  const messaging = getAdminMessaging();
  const invalidTokens: string[] = [];
  let sent = 0;
  const title = task.text;
  const body = taskReminderBody(reminder);

  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data: {
          type: 'scheduled_task_reminder',
          taskId: task.id,
          path: '/',
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
      console.error('FCM scheduled task reminder failed:', err?.message);
    }
  }

  if (invalidTokens.length > 0) {
    await UserModel.updateOne(
      { _id: userId },
      { $pull: { 'notificationPrefs.fcmTokens': { $in: invalidTokens } } },
    );
  }

  return sent;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();

  const now = new Date();
  const users = await UserModel.find({
    'notificationPrefs.enabled': true,
    'notificationPrefs.fcmTokens': { $exists: true, $ne: [] },
  })
    .select('_id notificationPrefs')
    .lean()
    .exec();

  const results: Array<{ userId: string; sent: number; checked: number }> = [];

  for (const user of users) {
    const userId = String((user as any)._id);
    const prefs = (user as any).notificationPrefs as NotificationPrefs;
    const timezone = prefs.timezone || 'UTC';
    const todayYMD = getZonedToday(timezone);
    const currentHour = getCurrentHourInTz(timezone);

    const tasks = await TaskModel.find({
      userId,
      deletedAt: { $exists: false },
      startTime: { $exists: true, $ne: '' },
      reminder: { $exists: true, $ne: '' },
      type: { $in: ['regular', 'weekly'] },
      $or: [
        { type: 'regular', date: todayYMD },
        { type: 'weekly' },
      ],
    })
      .lean()
      .exec();

    let sentForUser = 0;

    for (const task of tasks) {
      const reminderDate = getTaskReminderDate(task as TaskDoc, todayYMD);
      if (!reminderDate || isTaskDoneForDate(task as TaskDoc, reminderDate)) {
        continue;
      }

      const reminder = task.reminder ?? 'at_time';
      const offset = REMINDER_OFFSETS[reminder];
      if (offset === undefined || !task.startTime) continue;

      const startAt = zonedWallTimeToUtc(reminderDate, task.startTime, timezone);
      const remindAt = new Date(startAt.getTime() - offset);
      const delta = now.getTime() - remindAt.getTime();
      if (delta < 0 || delta > LOOKBACK_MS) continue;

      const reminderHour = Number(task.startTime.split(':')[0]);
      if (Math.abs(currentHour - reminderHour) > 2 && reminder !== '1h') {
        continue;
      }

      const reminderKey = `${reminderDate}:${task.id}:${task.startTime}:${reminder}`;
      const claim = await TaskModel.updateOne(
        {
          userId,
          id: task.id,
          reminderSentKeys: { $ne: reminderKey },
        },
        { $addToSet: { reminderSentKeys: reminderKey } },
      );

      if (claim.modifiedCount !== 1) continue;

      sentForUser += await sendTaskReminder({
        userId,
        tokens: prefs.fcmTokens ?? [],
        task: task as TaskDoc,
        reminder,
      });
    }

    results.push({ userId, sent: sentForUser, checked: tasks.length });
  }

  return NextResponse.json({
    ok: true,
    users: results.length,
    sent: results.reduce((sum, result) => sum + result.sent, 0),
    results,
  });
}
